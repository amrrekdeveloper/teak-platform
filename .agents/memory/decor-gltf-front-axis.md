---
name: Decor glTF front axis
description: How to determine which way a downloaded glTF appliance/furniture model faces without WebGL
---

Downloaded glTF decor assets face arbitrary axes (+X, -X, +Z...); guessing a 180° flip is often wrong when the true error is 90°.

**Why:** Sketchfab FBX/Collada exports keep author-local orientation; the kitchen scene assumes model front = +Z (wall rotY rotates +Z to the room's inward direction).

**How to apply:** Parse the scene.gltf JSON with a small node script: walk node tree, compose TRS world matrices, transform each mesh's POSITION accessor min/max corners, and compare the world centers of front-feature meshes (handle/buttons/glass, e.g. "Puxador", "botoes") against the body center. The offset axis is the front axis; set the item's `rotYOffset` to rotate that axis to +Z (front=+X → -π/2, front=-X → +π/2, front=-Z → π). Single-mesh models with square footprints give no cue — pick ±π/2 and let the user's 180° flip button cover the other case.
