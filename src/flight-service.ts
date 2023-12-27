import haversine from 'haversine';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import z from 'zod';

// TODO: tests!

interface Flight {
    departureTime: Date;
    arrivalTime: Date;
    carrier: string;
    origin: string;
    destination: string;
}

interface ScoredFlight {
    score: number;
    flight: Flight;
}

const flightSchema = z.array(
    z.object({
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
    })
);

export class FlightService {
    private static _instance?: FlightService;

    static async use(): Promise<FlightService> {
        this._instance ??= new FlightService();
        await this._instance.initialize();
        return this._instance;
    }

    private _flights: Flight[] = [];

    private async initialize(): Promise<void> {
        const flightData = await fs.readFile(path.join(__dirname, '../data.json'), {
            encoding: 'utf8',
        });
        const flightJson = JSON.parse(flightData);
        const flights = flightSchema.parse(flightJson);
        this._flights = flights;
    }

    async getFlights(): Promise<Flight[]> {
        return this._flights;
    }

    async searchFlights(
        limit: number,
        departureAirport: string,
        departure: Date,
        maxDuration?: number,
        preferredCarrier?: string
    ) {
        // TODO: Stream third-party API flight data using a stream
        // (readableStream) and return response using h3's `sendStream`

        const scoredList: ScoredFlight[] = [];

        for (const x of this._flights) {
            if (x.origin !== departureAirport) {
                continue;
            }

            if (x.departureTime.getTime() > departure.getTime()) {
                continue;
            }

            const duration = x.arrivalTime.getTime() - x.departureTime.getTime();

            if (maxDuration !== undefined && duration > maxDuration) {
                continue;
            }

            let preference = 1;
            if (preferredCarrier !== undefined && x.carrier === preferredCarrier) {
                preference = 0.9;
            }

            const distance = await getDistanceBetweenAirports(departureAirport, x.destination);

            // TODO: Factor out scoring function and write unit tests

            // (flight duration in hours) * (carrier preference) + (distance in
            // miles between airports)
            const score = duration * preference + distance;

            scoredList.push({ score, flight: x });
        }

        scoredList.sort((x, y) => x.score - y.score);

        // TODO: Max limit
        return scoredList.slice(0, limit);
    }
}

async function getDistanceBetweenAirports(code1: string, code2: string): Promise<number> {
    // TODO: Use https://openflights.org/ to lookup lat/long for each airport.
    // Cache the results

    const start = {
        latitude: 30.849635,
        longitude: -83.24559,
    };

    const end = {
        latitude: 27.950575,
        longitude: -82.457178,
    };

    return haversine(start, end, { unit: 'meter' });
}
