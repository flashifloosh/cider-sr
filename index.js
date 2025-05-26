import tmi from "tmi.js";
import dotenv from "dotenv";

dotenv.config();

const {
    TWITCH_USERNAME,
    TWITCH_OAUTH,
    TWITCH_CHANNEL,
    CIDER_API,
    CIDER_API_TOKEN,
} = process.env;

if (
    !TWITCH_USERNAME ||
    !TWITCH_OAUTH ||
    !TWITCH_CHANNEL ||
    !CIDER_API ||
    !CIDER_API_TOKEN
) {
    console.error("Missing required env vars");
    process.exit(1);
}

const client = new tmi.Client({
    options: { debug: true },
    identity: {
        username: TWITCH_USERNAME,
        password: TWITCH_OAUTH,
    },
    channels: [TWITCH_CHANNEL],
});

client.connect();

client.on("message", async (channel, tags, message, self) => {
    if (self) return;

    if (message.startsWith("!sr ")) {
        const query = message.slice(4).trim();

        try {
            let id, type, songTitle, songArtist;

            if (isValidUrl(query)) {
                const { storefront, songId } = parseAppleMusicUrl(query);
                if (!storefront || !songId) throw new Error("Invalid Apple Music URL");

                const songData = await fetchAppleMusicData(`/v1/catalog/${storefront}/songs/${songId}`);
                const songItem = songData?.data?.data?.[0];
                if (!songItem) throw new Error("Song not found");

                id = songItem.id;
                type = songItem.type;
                songTitle = songItem.attributes.name;
                songArtist = songItem.attributes.artistName;
            } else {
                const storefront = "us";
                const searchResult = await fetchAppleMusicData(
                    `/v1/catalog/${storefront}/search?term=${encodeURIComponent(query)}&types=songs&limit=1`
                );
                const songItem = searchResult?.data?.results?.songs?.data?.[0];
                if (!songItem) {
                    client.say(channel, `@${tags.username} Song not found!`);
                    return;
                }

                id = songItem.id;
                type = songItem.type;
                songTitle = songItem.attributes.name;
                songArtist = songItem.attributes.artistName;
            }

            await playLater(id, type);
            client.say(channel, `@${tags.username} Added "${songTitle}" by ${songArtist}! 🎶`);
        } catch (error) {
            console.error("Error handling song request:", error);
            client.say(channel, `@${tags.username} Sorry, something went wrong trying to add your song.`);
        }
    }
});

function parseAppleMusicUrl(url) {
    try {
        const u = new URL(url);

        const pathParts = u.pathname.split("/").filter(Boolean);
        const storefront = pathParts[0]; // e.g. "de", "us"
        const songId = u.searchParams.get("i");

        return { storefront, songId };
    } catch {
        return {};
    }
}

async function fetchAppleMusicData(path) {
    const url = `${CIDER_API}/v1/amapi/run-v3`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apptoken: CIDER_API_TOKEN,
        },
        body: JSON.stringify({ path }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch Apple Music data: ${text}`);
    }

    return res.json();
}

async function playLater(id, type) {
    const url = `${CIDER_API}/v1/playback/play-later`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apptoken: CIDER_API_TOKEN,
        },
        body: JSON.stringify({ id, type }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to add song to queue: ${text}`);
    }
}

function isValidUrl(str) {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}
