<script setup lang="ts">
import { LIMITS } from '@shared/limits'

// embedded：放在對話框裡時用，標題改由對話框顯示
defineProps<{ embedded?: boolean }>()

const openSource = [
  { name: 'Vue', license: 'MIT', url: 'https://github.com/vuejs/core' },
  { name: 'Vue Router', license: 'MIT', url: 'https://github.com/vuejs/router' },
  { name: 'Vite', license: 'MIT', url: 'https://github.com/vitejs/vite' },
  { name: 'Lucide（介面圖示）', license: 'ISC', url: 'https://github.com/lucide-icons/lucide' },
  { name: 'Cloudflare Workers SDK（Wrangler、Vite plugin）', license: 'MIT / Apache-2.0', url: 'https://github.com/cloudflare/workers-sdk' },
  { name: 'resvg-js（只在產生圖示時使用）', license: 'MPL-2.0', url: 'https://github.com/thx/resvg-js' },
]
</script>

<template>
  <component :is="embedded ? 'div' : 'main'" class="about" :class="{ embedded }">
    <h1 v-if="!embedded">關於夯肉</h1>

    <section class="card">
      <h2>關於本站</h2>
      <p>夯肉是一個多人線上烤肉小遊戲。開一個烤肉場、把連結分享給朋友，大家就能在同一個烤架上一起烤。</p>
      <ul>
        <li>把食材拖到烤架上就開始烤。烤架中間火最大，邊緣比較小。</li>
        <li>點一下翻面、點兩下吃掉。切到「刷醬」工具可以刷烤肉醬。</li>
        <li>兩面都烤到剛好再吃，分數最高。放太久會焦，再久就會燒成灰消失。</li>
      </ul>
    </section>

    <section class="card">
      <h2>版權標示</h2>
      <p>網站 logo 與 favicon 使用 Flaticon 的圖示：</p>
      <p class="credit">
        <a href="https://www.flaticon.com/free-icons/bbq-grill" title="BBQ grill icons" target="_blank" rel="noopener noreferrer"
          >BBQ grill icons created by photo3idea_studio - Flaticon</a
        >
      </p>
      <p class="muted">
        圖示原始頁面：<a href="https://www.flaticon.com/free-icon/campfire_4062324" target="_blank" rel="noopener noreferrer"
          >Campfire free icon</a
        >，依 Flaticon License（免費使用，需標示出處）使用。
      </p>
    </section>

    <section class="card">
      <h2>音效與圖像</h2>
      <p>所有音效都是在瀏覽器裡用 Web Audio 即時合成的，沒有使用外部音檔。烤架和內建食材的圖都是本站自己畫的 SVG。</p>
    </section>

    <section class="card">
      <h2>使用的開源專案</h2>
      <ul>
        <li v-for="p in openSource" :key="p.name">
          <a :href="p.url" target="_blank" rel="noopener noreferrer">{{ p.name }}</a>
          <span class="muted">（{{ p.license }}）</span>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>聊天與彈幕</h2>
      <ul>
        <li>新訊息會以彈幕從烤架右邊飄到左邊。不想看可以在聊天室右上角關掉；系統設定「減少動態效果」時也不會顯示。</li>
        <li>把滑鼠移到某則訊息上，按右邊的眼睛圖示，可以隱藏這個人的訊息和表情。</li>
        <li>隱藏只在你自己的瀏覽器生效，其他人還是看得到。對方換瀏覽器或用無痕視窗會變成新的玩家，需要再隱藏一次。</li>
      </ul>
    </section>

    <section class="card">
      <h2>上傳圖片規範</h2>
      <ul>
        <li>只能上傳你自己有權使用的圖片，不要上傳色情、暴力或侵權的內容。</li>
        <li>支援 PNG、JPEG、WebP。圖片會先在你的瀏覽器縮到 {{ LIMITS.clientResizeDim }}px 再上傳，上限 {{ LIMITS.uploadMaxBytes / 1024 }} KB、{{ LIMITS.uploadMaxDim }}×{{ LIMITS.uploadMaxDim }}。</li>
        <li>上傳的圖片只在那個房間使用。房間 24 小時沒人就會收攤，圖片會一起刪除。</li>
        <li>分享房間連結時，預覽卡片不會顯示上傳的圖片。</li>
      </ul>
    </section>

    <section class="card">
      <h2>隱私</h2>
      <ul>
        <li>不用註冊，也不需要任何個人資料。</li>
        <li>瀏覽器只會存你的暱稱、音量、彈幕開關、排行榜收合狀態、隱藏名單和玩家代號（<code>localStorage</code>）。同一個瀏覽器開好幾個分頁，都算同一個玩家。</li>
        <li>本站不放廣告和追蹤碼，也不載入外部字型或第三方腳本。</li>
        <li>伺服器會記下匿名的使用統計，例如每天開了幾場、哪種食材最常烤焦。統計裡沒有暱稱、玩家代號、聊天內容和上傳的圖片。</li>
      </ul>
    </section>
  </component>
</template>

<style scoped>
.about {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 16px 0;
}

.about.embedded {
  padding: 0;
}

.about.embedded section:last-child {
  margin-bottom: 0;
}

h1 {
  margin: 0 0 16px;
  font-size: 1.6rem;
}

section {
  margin-bottom: 12px;
  padding: 16px 20px;
}

h2 {
  margin: 0 0 8px;
  font-size: 1.05rem;
  color: var(--gold);
}

p,
ul {
  margin: 0 0 6px;
}

ul {
  padding-left: 1.2em;
}

li {
  margin: 3px 0;
}

.credit {
  font-weight: 600;
}

.muted {
  color: var(--muted);
  font-size: 0.9rem;
}

code {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 0.85em;
}
</style>
