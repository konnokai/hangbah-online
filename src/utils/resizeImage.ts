import { LIMITS } from '@shared/limits'

/**
 * 在瀏覽器把圖縮到最長邊 LIMITS.clientResizeDim，轉成 WebP。
 * server 還會再檢查一次，這裡只是讓大部分圖片不會被擋、上傳也比較快。
 */
export async function resizeImage(file: File): Promise<Blob> {
  // 解碼超大圖會吃光手機記憶體，先擋掉
  if (file.size > 25 * 1024 * 1024) throw new Error('圖片太大了（超過 25 MB）')
  if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type)) throw new Error('只支援 PNG、JPEG、WebP 圖片')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('讀不到這張圖片')
  }
  const max = LIMITS.clientResizeDim
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // 舊版 Safari 不支援輸出 WebP，會默默改成 PNG，所以要檢查實際格式
  let blob = await toBlob('image/webp', 0.86)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/png')
  if (!blob) throw new Error('圖片轉檔失敗')
  if (blob.size > LIMITS.uploadMaxBytes) throw new Error('縮圖後還是太大，換一張簡單一點的圖')
  return blob
}
