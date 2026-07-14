const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

/**
 * Inventory image storage, backed by Azure Blob Storage.
 *
 * Requires in .env:
 *   AZURE_STORAGE_CONNECTION_STRING=<from Azure Portal -> Storage Account -> Access keys>
 *   AZURE_STORAGE_CONTAINER_NAME=inventory-images   (or whatever you name it)
 *
 * The container is created automatically (if missing) with public **blob**
 * read access — meaning individual image URLs are publicly viewable (needed
 * so the catalog page can just <img src="..."> them directly), but the
 * container itself cannot be browsed/listed by the public.
 */

let containerClientPromise = null;

function getContainerClient() {
  if (containerClientPromise) return containerClientPromise;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "inventory-images";

  if (!connectionString) {
    throw Object.assign(
      new Error("Image upload is not configured yet (AZURE_STORAGE_CONNECTION_STRING is missing)."),
      { statusCode: 503 }
    );
  }

  containerClientPromise = (async () => {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists({ access: "blob" });
    return containerClient;
  })();

  return containerClientPromise;
}

// Uploads a batch of in-memory files (from multer) and returns their public URLs,
// in the same order as the input files. Blob names are lightly grouped by
// year-month (e.g. "2026-07/<uuid>.jpg") — purely cosmetic for browsing in
// the Azure Portal; blob storage has no real folders and lookup speed is
// unaffected either way.
async function uploadInventoryImages(files) {
  const containerClient = await getContainerClient();
  const monthPrefix = new Date().toISOString().slice(0, 7); // "2026-07"

  const uploads = files.map(async (file) => {
    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const blobName = `${monthPrefix}/${crypto.randomUUID()}.${ext}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    return blockBlobClient.url;
  });

  return Promise.all(uploads);
}

// Deletes blobs given their full public URLs (as stored on Inventory.images).
// Used to clean up storage when a photo is removed from an item, or when the
// item itself is deleted — otherwise storage grows forever with orphaned
// files nobody can even see anymore. Best-effort: a failed delete here should
// never block the actual database operation the caller is doing.
async function deleteInventoryImages(urls) {
  if (!urls || urls.length === 0) return;

  let containerClient;
  try {
    containerClient = await getContainerClient();
  } catch (err) {
    console.error("[BlobStorage] Skipping cleanup — not configured:", err.message);
    return;
  }

  await Promise.all(
    urls.map(async (url) => {
      try {
        const blobName = new URL(url).pathname.split("/").slice(2).join("/"); // strip /<container>/
        await containerClient.getBlockBlobClient(blobName).deleteIfExists();
      } catch (err) {
        console.error(`[BlobStorage] Failed to delete ${url}:`, err.message);
      }
    })
  );
}

module.exports = { uploadInventoryImages, deleteInventoryImages };
 