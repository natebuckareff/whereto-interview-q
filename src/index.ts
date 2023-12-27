import { createApp, createError, createRouter, eventHandler, getQuery, toNodeListener } from 'h3';
import { listen } from 'listhen';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import BTree from 'sorted-btree';
import StreamArray from 'stream-json/streamers/StreamArray';
import z, { ZodError } from 'zod';
import { getDistanceBetweenAirports } from './airports';

const app = createApp();

const INTEGER_REGEX = /^[0-9]+$/;

// TODO: Use https://github.com/wobsoriano/h3-zod
const endpointSchema = z.object({
    departureAirport: z.string(),
    departure: z
        .string()
        .datetime()
        .transform(x => new Date(x)),
    maxDuration: z.number().optional(),
    preferredCarrier: z.string().optional(),
    limit: z
        .string()
        .refine(x => INTEGER_REGEX.test(x))
        .transform(x => Number(x)),
});

const flightSchema = z.object({
    departureTime: z
        .string()
        .datetime()
        .transform(x => new Date(x)),
    arrivalTime: z
        .string()
        .datetime()
        .transform(x => new Date(x)),
    carrier: z.string(),
    origin: z.string(),
    destination: z.string(),
});

interface ScoredFlight {
    score: number;
    distance: number;
    duration: number;
    departureTime: Date;
    arrivalTime: Date;
    carrier: string;
    origin: string;
    destination: string;
}

const clamp = (x: number, a: number, b: number) => {
    return Math.max(a, Math.min(x, b));
};

const router = createRouter().get(
    '/search',
    eventHandler(async event => {
        try {
            const params = getQuery(event);
            const { limit, departureAirport, departure, maxDuration, preferredCarrier } =
                endpointSchema.parse(params);

            const stream = createReadStream(join(__dirname, '../data.json')).pipe(
                StreamArray.withParser()
            );

            const scoredFlights = new BTree<number, ScoredFlight>();

            for await (const { value } of stream) {
                const flight = flightSchema.parse(value);
                const { departureTime, arrivalTime, carrier, origin, destination } = flight;

                // Skip if departs in future
                if (departureTime < departure) {
                    continue;
                }

                // Skip if not current airport
                if (origin !== departureAirport) {
                    continue;
                }

                // Skip if not preferred carrier
                if (preferredCarrier !== undefined && carrier !== preferredCarrier) {
                    continue;
                }

                // (flight duration in hours) * (carrier preference) + (distance
                // in miles between airports)

                const duration = arrivalTime.getTime() - departureTime.getTime();

                // Skip if duration is too large
                if (maxDuration !== undefined && duration > maxDuration) {
                    continue;
                }

                const distance = await getDistanceBetweenAirports(departureAirport, destination);

                let carrierScore = 1;
                if (preferredCarrier !== undefined) {
                    if (preferredCarrier === carrier) {
                        carrierScore = 0.9;
                    }
                }

                const score = duration * carrierScore + distance;
                scoredFlights.set(score, {
                    score,
                    distance,
                    duration,
                    ...flight,
                });

                // Prune results
                if (scoredFlights.size > clamp(limit, 1, 100)) {
                    const maxKey = scoredFlights.maxKey()!;
                    scoredFlights.delete(maxKey);
                }
            }

            return scoredFlights.valuesArray();
        } catch (err) {
            if (err instanceof ZodError) {
                for (const issue of err.issues) {
                    console.log(issue);
                }
                throw createError({ statusCode: 401, fatal: true, message: 'validation error' });
            }

            throw createError({ statusCode: 500, fatal: true });
        }
    })
);

app.use(router);

listen(toNodeListener(app), { port: 8080 });
