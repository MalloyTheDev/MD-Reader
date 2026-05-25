import type { MdReaderApi } from '../shared/types'

declare global {
  interface Window {
    api: MdReaderApi
  }
}
