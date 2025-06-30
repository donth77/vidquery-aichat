import dotenv from "dotenv";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

dotenv.config();

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
});

export const vectorStore = await PGVectorStore.initialize(embeddings, {
  postgresConnectionOptions: {
    connectionString: process.env.DB_URL,
  },
  tableName: "transcripts",
  columns: {
    idColumnName: "id",
    vectorColumnName: "vector",
    contentColumnName: "content",
    metadataColumnName: "metadata",
  },
  distanceStrategy: "cosine",
});

export const addYTVideoToVectorStore = async (videoData) => {
  console.log("Adding video to vector store:", videoData.video_id);
  try {
    const { transcript, video_id } = videoData;

    const docs = [
      new Document({
        pageContent: transcript,
        metadata: { video_id },
      }),
    ];

    // Split the video into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitDocuments(docs);

    await vectorStore.addDocuments(chunks);
  } catch (error) {
    console.error("Error adding video to vector store:", error);
  }
};
