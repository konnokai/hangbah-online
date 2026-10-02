import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/*
 * 直拿的手機不另外做直版，整個畫面轉 90 度照電腦版顯示，玩家自己把手機轉橫。
 * 手機本來就是橫的（開了自動旋轉）就不轉。直拿的平板夠寬，照電腦版直接顯示。
 * 轉的樣式在 main.css 的 html.rotated。
 */
const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)'

const isRotated = () => document.documentElement.classList.contains('rotated')

/**
 * 螢幕座標（clientX/Y）換成 #app 裡的版面座標。
 * #app 順時針轉 90 度，版面的左上角在螢幕右上角：版面往右是螢幕往下，版面往下是螢幕往左。
 */
export function toLocal(clientX: number, clientY: number) {
  if (!isRotated()) return { x: clientX, y: clientY }
  return { x: clientY, y: window.innerWidth - clientX }
}

/** 元素在版面座標裡的框。getBoundingClientRect() 給的是轉過以後的螢幕框，寬高會對調 */
export function localRect(el: Element) {
  const r = el.getBoundingClientRect()
  if (!isRotated()) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
  const left = r.top
  const top = window.innerWidth - r.right
  return { left, top, right: left + r.height, bottom: top + r.width, width: r.height, height: r.width }
}

// 勾選框、音量滑桿不會跳出鍵盤，不算在打字
const TEXT_INPUT = 'input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"]), textarea, [contenteditable="true"]'

/** active 為 true 而且是直拿的手機時，在 <html> 加上 rotated */
export function useRotated(active: Ref<boolean>) {
  const mq = matchMedia(PORTRAIT_PHONE)
  // 鍵盤從手機真正的下面跳出來，轉著的話會蓋住半個畫面，所以打字時先轉回直的，打完再轉回來（雀魂也是這樣）
  const typing = ref(false)
  const apply = () => document.documentElement.classList.toggle('rotated', active.value && mq.matches && !typing.value)
  const onFocusIn = (e: FocusEvent) => {
    typing.value = e.target instanceof Element && e.target.matches(TEXT_INPUT)
  }
  const onFocusOut = (e: FocusEvent) => {
    // 直接換到另一個輸入框時不要轉來轉去
    if (!(e.relatedTarget instanceof Element && e.relatedTarget.matches(TEXT_INPUT))) typing.value = false
  }
  mq.addEventListener('change', apply)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  watch([active, typing], apply, { immediate: true })
  onBeforeUnmount(() => {
    mq.removeEventListener('change', apply)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    document.documentElement.classList.remove('rotated')
  })
}
