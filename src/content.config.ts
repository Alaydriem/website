import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// Not `z` from 'astro:content': that re-export is deprecated in Astro 7.
import { z } from 'astro/zod';

/**
 * Tools shown on the homepage panel.
 *
 * There is deliberately no src/pages/tools/ route, so no detail pages are
 * emitted. The schema is what Hugo could not give: a missing or misspelled
 * field fails the build rather than rendering an empty row.
 */
const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    // z.url(), not z.string().url(): the latter is deprecated in the zod
    // version Astro 7 ships.
    repo: z.url().optional(),
    href: z.url().optional(),
    platforms: z.array(z.string()).default([]),
    // A spectrum token name from src/styles/_tokens.scss. Violet is permitted
    // here only because Bedrock Voice Chat is the product violet belongs to.
    accent: z.string().default('sp-mint'),
    weight: z.number().default(100),
  }),
});

export const collections = { tools };
