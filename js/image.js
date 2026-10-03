// Shrinks a receipt photo before upload: long edge ≤ 1600 px, JPEG quality 0.8.
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function resizeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read this photo — try a screenshot or JPG.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error("Couldn't read this photo — try a screenshot or JPG.");
  return blob;
}
