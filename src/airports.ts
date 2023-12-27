import { parse } from 'csv-parse';
import haversine from 'haversine';
import assert from 'node:assert';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

let AIRPORT_LOCATIONS: Map<string, { latitude: number; longitude: number }> | undefined;

async function loadAirportLocations() {
    const csvParser = parse({ delimiter: ',' });
    const csvStream = createReadStream(join(__dirname, '../airports.dat')).pipe(csvParser);

    const airports = new Map<string, { latitude: number; longitude: number }>();
    for await (const record of csvStream) {
        const code = record[4];
        if (code === '\\N') continue;
        const latitude = record[6];
        const longitude = record[7];
        airports.set(code, { latitude, longitude });
    }
    return airports;
}

export async function getDistanceBetweenAirports(code1: string, code2: string): Promise<number> {
    AIRPORT_LOCATIONS ??= await loadAirportLocations();

    const start = AIRPORT_LOCATIONS.get(code1);
    const end = AIRPORT_LOCATIONS.get(code2);

    assert(start !== undefined);
    assert(end !== undefined);

    return haversine(start, end, { unit: 'meter' });
}
