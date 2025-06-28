/**
 * YouTube retrieval agent
 *
 * Exposes three tools:
 *   1. triggerYoutubeVideoScrape   – kicks off BrightData scraping for a video URL
 *   2. retrieve                    – returns transcript chunks for one video
 *   3. retrieveSimilarVideos       – returns IDs of videos semantically close to a query
 *
 * The agent is intended to be imported and invoked by higher-level application logic.
 * All heavy lifting (scraping, embedding, similarity search) is delegated to helpers
 * in the same project.  Nothing in this file hits the network directly except the
 * BrightData trigger call.
 *
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { MemorySaver } from "@langchain/langgraph";

import { vectorStore, addYTVideoToVectorStore } from "./embeddings.js";
import { triggerYoutubeVideoScrape } from "./brightdata.js";

/**
 * triggerYoutubeVideoScrape
 *
 * Starts a BrightData snapshot job for the provided YouTube URL.
 * Returns the BrightData snapshot ID so the caller can poll for completion.
 *
 * Notes:
 *   • Typical latency is ~7 s – do *not* await job completion here.
 *   • Callers *must* ensure the video is not already indexed; this tool
 *     performs no deduplication check.
 */
const triggerYoutubeVideoScrapeTool = tool(
  async ({ url }) => {
    console.log("Triggering YouTube video scrape", url);

    const snapshotId = await triggerYoutubeVideoScrape(url);

    console.log("YouTube video scrape triggered", snapshotId);
    return snapshotId;
  },
  {
    name: "triggerYoutubeVideoScrape",
    description: `
      Trigger the scraping of a YouTube video using its URL.
      The tool starts a scraping job that usually takes around 7 seconds.
      It returns a snapshot/job ID that can be used to check the status of the scraping job.
      Before calling this tool, make sure the video isn't already in the vector store.
    `,
    schema: z.object({
      url: z.string(),
    }),
  }
);

/**
 * Retrieval
 *
 * Given a free-text query and a YouTube video ID, returns the top N transcript
 * fragments that best match the query.  Uses vector similarity on embeddings
 * generated elsewhere (see ./embeddings.js).
 *
 * Parameters:
 *   • query     – natural-language question or phrase
 *   • video_id  – YouTube ID (11-char canonical form)
 *
 * Returns: newline-delimited string of transcript chunks, *not* raw documents.
 */
const retrieveTool = tool(
  async ({ query, video_id: videoId }) => {
    const retrievedDocs = await vectorStore.similaritySearch(query, 3, {
      video_id: videoId,
    });

    const serializedDocs = retrievedDocs
      .map((doc) => doc.pageContent)
      .join("\n ");

    return serializedDocs;
  },
  {
    name: "retrieve",
    description:
      "Retrieve the most relevant chunks of text from the transcript for a specific YouTube video.",
    schema: z.object({
      query: z.string(),
      video_id: z.string().describe("The ID of the video to retrieve."),
    }),
  }
);

/**
 * retrieveSimilarVideos
 *
 * Returns a list of video IDs whose *overall* content is similar to the query,
 * regardless of whether the videos are already in context.  Intended for
 * recommendation workflows (e.g., “show me more videos like this”).
 *
 * Currently returns up to 30 matches; tweak as needed.
 */
const retrieveSimilarVideosTool = tool(
  async ({ query }) => {
    const retrievedDocs = await vectorStore.similaritySearch(query, 30);

    const ids = retrievedDocs.map((doc) => doc.metadata.video_id).join("\n ");

    return ids;
  },
  {
    name: "retrieveSimilarVideos",
    description: "Retrieve the IDs of the most similar videos to the query.",
    schema: z.object({
      query: z.string(),
    }),
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Language model and agent wiring
// ─────────────────────────────────────────────────────────────────────────────

const llm = new ChatAnthropic({
  // modelName: "claude-3-7-sonnet-latest",
  modelName: "claude-sonnet-4-20250514",
});

const checkpointer = new MemorySaver(); // persists intermediate state across agent steps

/**
 * Exported agent instance
 *
 * Consumers import { agent } and then call agent.invoke({ ... }) with messages.
 * The tools defined above automatically register with the agent.
 */
export const agent = createReactAgent({
  llm,
  tools: [
    retrieveTool,
    triggerYoutubeVideoScrapeTool,
    retrieveSimilarVideosTool,
  ],
  checkpointer,
});
