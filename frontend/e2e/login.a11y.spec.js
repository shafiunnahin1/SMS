import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// E2E-TESTING.md section 5 (R1 subset): no serious or critical axe violation on the login page of each demo tenant
test('axe: the login page has no serious or critical violation', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  expect(bad, bad.map(v => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')).toEqual([])
})
