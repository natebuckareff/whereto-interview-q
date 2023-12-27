import { createApp, createError, createRouter, eventHandler, getQuery, toNodeListener } from 'h3';
import { listen } from 'listhen';
import z from 'zod';
import { FlightService } from './flight-service';

const app = createApp();

const INTEGER_REGEX = /^[0-9]+$/;

// TODO: Use https://github.com/wobsoriano/h3-zod
const searchParams = z.object({
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

const router = createRouter().get(
    '/search',
    eventHandler(async event => {
        const flightService = await FlightService.use();

        try {
            const params = getQuery(event);
            const { limit, departureAirport, departure, maxDuration, preferredCarrier } =
                searchParams.parse(params);

            const result = await flightService.searchFlights(
                limit,
                departureAirport,
                departure,
                maxDuration,
                preferredCarrier
            );

            return result;
        } catch (err) {
            // TODO: Check the type of error. Return 4xx for validation errors
            // etc. Might be handled by h3-zod
            console.debug(err);

            throw createError({ statusCode: 500, fatal: true });
        }
    })
);

app.use(router);

listen(toNodeListener(app), { port: 8080 });
