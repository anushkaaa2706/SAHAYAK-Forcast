export default async function handler(req, res) {
    try {
        const lat = Number(req.query.lat);
        const lon = Number(req.query.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({
                success: false,
                message: "Valid latitude and longitude are required."
            });
        }

        const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=precipitation,precipitation_probability,relative_humidity_2m,cloud_cover,wind_speed_10m,wind_gusts_10m,weather_code,temperature_2m` +
    `&past_days=7` +
    `&forecast_days=1` +
    `&timezone=Asia%2FKolkata`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Open-Meteo returned ${response.status}`);
        }

        const data = await response.json();

        const times = data.hourly.time;
        const rainfall = data.hourly.precipitation;
        const precipitationProbability = data.hourly.precipitation_probability;
const humidity = data.hourly.relative_humidity_2m;
const cloudCover = data.hourly.cloud_cover;
const windSpeed = data.hourly.wind_speed_10m;
const windGusts = data.hourly.wind_gusts_10m;
const weatherCode = data.hourly.weather_code;
const temperature = data.hourly.temperature_2m;

        const now = new Date();

        let latestIndex = -1;

        for (let i = 0; i < times.length; i++) {
            const time = new Date(`${times[i]}:00+05:30`);

            if (time <= now) {
                latestIndex = i;
            }
        }

        if (latestIndex === -1) {
            throw new Error("No rainfall data available.");
        }
        function sumLastHours(hours) {
    let total = 0;

    const startIndex = Math.max(0, latestIndex - hours + 1);

    for (let i = startIndex; i <= latestIndex; i++) {
        total += rainfall[i] || 0;
    }

    return Number(total.toFixed(1));
}

const rainfall24h = sumLastHours(24);
const rainfall48h = sumLastHours(48);
const rainfall72h = sumLastHours(72);
const rainfall7day = sumLastHours(168);

const hourly24h = rainfall.slice(
    Math.max(0, latestIndex - 23),
    latestIndex + 1
);
const hourlyTimes24h = times.slice(
    Math.max(0, latestIndex - 23),
    latestIndex + 1
);

const accumulated24h = [];
let runningTotal = 0;

for (const value of hourly24h) {
    runningTotal += value || 0;
    accumulated24h.push(Number(runningTotal.toFixed(1)));
}

        return res.status(200).json({
            success: true,
            source: "Open-Meteo",
            location: {
                latitude: lat,
                longitude: lon
            },
            rainfall_mm: Number((rainfall[latestIndex] || 0).toFixed(1)),
            humidity_percent: humidity[latestIndex] ?? null,
cloud_cover_percent: cloudCover[latestIndex] ?? null,
precipitation_probability_percent:
    precipitationProbability[latestIndex] ?? null,
wind_speed_kmh: windSpeed[latestIndex] ?? null,
wind_gusts_kmh: windGusts[latestIndex] ?? null,
weather_code: weatherCode[latestIndex] ?? null,
temperature_c: temperature[latestIndex] ?? null,
            rainfall_24h: rainfall24h,
            rainfall_48h: rainfall48h,
            rainfall_72h: rainfall72h,
            rainfall_7day: rainfall7day,
            hourly_24h: hourly24h,
            accumulated_24h: accumulated24h,
            hourly_times_24h: hourlyTimes24h,
            timestamp: times[latestIndex],
            unit: "mm",
            description: "Precipitation during the preceding hour"
        });

    } catch (error) {
        console.error("Rainfall API error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch rainfall data.",
            error: error.message
        });
    }
}