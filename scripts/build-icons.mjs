// 從 Flaticon 營火圖示產生 favicon、logo 和分享預覽圖。
// 輸出的 PNG 會 commit 進 repo，平常不用跑；換圖或改設計時再執行 `npm run icons`。
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const src = readFileSync(new URL('../assets-src/campfire.png', import.meta.url)).toString('base64')
const icon = `data:image/png;base64,${src}`
const out = (name) => new URL(`../public/${name}`, import.meta.url)

function render(svg, width, file) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    // 中文字要用系統字型；這台是 Windows，所以用微軟正黑體
    font: { loadSystemFonts: true, defaultFontFamily: 'Microsoft JhengHei' },
  })
    .render()
    .asPng()
  writeFileSync(out(file), png)
  console.log(`${file} ${png.length} bytes`)
}

// 透明背景的圖示
const plain = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <image href="${icon}" width="512" height="512"/>
</svg>`

// iOS 主畫面和 PWA 圖示不支援透明背景，加一塊深色圓角底
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="70%" r="70%">
      <stop offset="0%" stop-color="#5a2410"/><stop offset="100%" stop-color="#15100d"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <image href="${icon}" x="64" y="56" width="384" height="384"/>
</svg>`

render(plain, 16, 'favicon-16.png')
render(plain, 32, 'favicon-32.png')
render(plain, 256, 'logo.png')
render(tile, 180, 'apple-touch-icon.png')
render(tile, 192, 'icon-192.png')
render(tile, 512, 'icon-512.png')

// 分享預覽圖 1200×630
const bars = Array.from({ length: 11 }, (_, i) => `<rect x="680" y="${120 + i * 38}" width="480" height="7" rx="3" fill="#8f8882" opacity="0.55"/>`).join('')
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="70%" cy="60%" r="80%">
      <stop offset="0%" stop-color="#7a2d0e"/><stop offset="45%" stop-color="#2d150b"/><stop offset="100%" stop-color="#120c09"/>
    </radialGradient>
    <radialGradient id="heat" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#ffb347" stop-opacity="0.85"/><stop offset="60%" stop-color="#ff5a14" stop-opacity="0.35"/><stop offset="100%" stop-color="#ff5a14" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="660" y="100" width="520" height="440" rx="36" fill="url(#heat)"/>
  ${bars}
  <image href="${icon}" x="700" y="110" width="420" height="420"/>
  <text x="80" y="250" font-family="Microsoft JhengHei" font-weight="700" font-size="92" fill="#fff4e8">一起來烤肉！</text>
  <text x="84" y="330" font-family="Microsoft JhengHei" font-weight="700" font-size="40" fill="#ffc15e" letter-spacing="4">夯肉 · 線上多人烤肉</text>
  <text x="84" y="410" font-family="Microsoft JhengHei" font-size="32" fill="#e8d6c6">開一個烤肉場，把連結丟給朋友</text>
  <text x="84" y="458" font-family="Microsoft JhengHei" font-size="32" fill="#e8d6c6">大家在同一個烤架上翻肉、搶肉</text>
</svg>`
render(og, 1200, 'og.png')
