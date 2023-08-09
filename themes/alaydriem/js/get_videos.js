import fetch from 'node-fetch';
import yaml from 'js-yaml';
import json2toml from 'json2toml';
import fs from 'fs';

// Read the main configuration file for Hugo to get the channel ID + API Key
const config = yaml.load(fs.readFileSync(process.cwd() + '/../../config.yaml'));

const channel_id = config.params.channel_id;
const api_key = config.params.api_key;
let search = "https://youtube.googleapis.com/youtube/v3/search?maxResults=50&channelId=" + channel_id + "&key=" + api_key + "&type=video";

// Function to search for all of the videos on the channel
async function getVideos(url, pageToken = 0) {
    let q = pageToken == 0 ? search : search + "&pageToken=" + pageToken;
    return await fetch(q)
        .then((data) => data.json())
        .then(async (response) => {
            var v = [];
            if (typeof response.nextPageToken != 'undefined') {
                v = await getVideos(url, response.nextPageToken);
            }

            let list = [];
            response.items.forEach(e => {
                list.push(e.id.videoId);
            });

            return list.concat(v);
        });
}

let videos = await getVideos(search);

let video_chunks = [];

let outer_counter = 0;
// Chunk the requests to 50 videos
for (let i = 1; i <= videos.length; i++) {
    if (typeof video_chunks[outer_counter] == "undefined") {
        video_chunks[outer_counter] = [];
    }

    video_chunks[outer_counter].push(videos[(i - 1)]);
    if (i % 50 == 0) {
        outer_counter += 1;
    }
}

var all_videos = [];
for (const v of video_chunks) {
    let query = "https://youtube.googleapis.com/youtube/v3/videos?maxResults=50&part=id&part=player&part=contentDetails&part=snippet&part=statistics&part=status&id=" + v.join(',') + "&key=" + api_key;
    let r = await fetch(query)
        .then((data) => data.json())
        .then(async (response) => {
            for (const d of response.items) {
                all_videos.push(d);
            }
        });
}

all_videos.forEach((v) => {
    v.title = v.snippet.title;
    v.date = v.snippet.publishedAt;
    v.description = v.snippet.title;
    v.slug = v.id;
    v.keywords = v.snippet.tags;
    let result = json2toml(v);
    fs.writeFileSync(process.cwd() + '/../../content/videos/' + v.id + '.md', result);
    fs.appendFileSync(process.cwd() + '/../../content/videos/' + v.id + '.md', '---');
});