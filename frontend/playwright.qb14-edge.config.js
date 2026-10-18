import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

const projects = base.projects.map(project => ({
  ...project,
  use: {
    ...project.use,
    launchOptions: { ...project.use.launchOptions, channel: 'msedge' },
  },
}))

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    launchOptions: { ...base.use.launchOptions, channel: 'msedge' },
  },
  projects,
})
