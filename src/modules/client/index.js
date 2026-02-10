import { initStartup } from '../startup'

export function initClient() {
  return initStartup()
}

export default {
  init: initClient,
}
