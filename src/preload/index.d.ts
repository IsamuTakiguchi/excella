import type { ExcellaApi } from '../shared/ipc'

declare global {
  interface Window {
    excella: ExcellaApi
  }
}

export {}
