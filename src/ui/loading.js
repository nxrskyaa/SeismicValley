const loader = () => document.getElementById('boot-screen')

export async function bootStage(label, progress) {
  const node = loader()
  if (!node) return
  node.querySelector('.boot-status').textContent = label
  node.querySelector('.boot-number').textContent = `${Math.round(progress * 100)}`
  node.querySelector('.boot-track').style.setProperty('--progress', progress)
  node.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(Math.round(progress * 100)))
  // Let the browser paint each completed preparation stage, including in a background tab.
  await new Promise(resolve => setTimeout(resolve, 0))
}

export function finishLoading(onReady) {
  const node = loader()
  if (!node) { onReady(); return }
  node.classList.add('has-world')
  node.querySelector('.boot-status').textContent = 'Valley ready'
  node.querySelector('.boot-number').textContent = '100'
  node.querySelector('.boot-track').style.setProperty('--progress', 1)
  node.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', '100')
  const skip = node.querySelector('.boot-skip')
  skip.hidden = false
  let done = false
  const finish = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    node.classList.add('is-out')
    onReady()
    setTimeout(() => node.remove(), 650)
  }
  skip.addEventListener('click', finish)
  const timer = setTimeout(finish, matchMedia('(prefers-reduced-motion: reduce)').matches ? 350 : 3600)
}

export function failLoading() {
  const node = loader()
  if (!node) return
  node.querySelector('.boot-status').textContent = 'The valley could not open. Please reload and try again.'
  const retry = node.querySelector('.boot-skip')
  retry.hidden = false
  retry.textContent = 'Reload'
  retry.addEventListener('click', () => location.reload())
}
