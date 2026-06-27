#!/usr/bin/env tsx

import { scrapeNodeSecurityPosts } from '../src/lib/node-posts.utils';

const count = parseInt(process.argv[2] || '5', 10);

scrapeNodeSecurityPosts(count)
  .then((posts) => {
    console.log(JSON.stringify(posts, null, 2));
    return posts;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
