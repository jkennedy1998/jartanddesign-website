# _postmedia

Dedicated staging folder for media posted through Platform Blender (`/jobo/domains/platform-blender/`).

Any post that needs a public media URL (Instagram in particular) gets its image/video files
copied in here, one subfolder per format bucket then per post slug:

```
_postmedia/<bucket>/<slug>/<filename>
```

Files land here via a normal commit + push, then get fetched publicly at
`https://raw.githubusercontent.com/<owner>/jartanddesign-website/<branch>/_postmedia/<bucket>/<slug>/<filename>`.

This folder is kept separate from the rest of the site on purpose: it will accumulate every
image/video ever posted and grow the repo's git history indefinitely (deleting a file here
stops serving it publicly but does not shrink `.git`). Keeping it isolated in its own folder
means that growth stays easy to reason about, and easy to prune/rewrite later, without ever
touching `/jobo` itself.
