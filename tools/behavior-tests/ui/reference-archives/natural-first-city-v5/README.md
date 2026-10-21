# Original first-city recorder v5

These exact recorder bytes produced the six accepted Gaian difficulty cases in
`../../observations/smacx-gog-2.0-natural-first-city.json`. The original evidence
SHA-256 is `bacee299f955022230ce4fc7636e69e7234b75976ed3f357e79c5fc0232c01dd`.
The standalone recorder file SHA-256 is
`1c4e1803171c3fe3c0fc95bf8686c65a91797713629628aa3bdc67a2433957cd`;
its transitive adapter fingerprint in the evidence is
`7e564254293e3b55e6955d66eeec062a253624b81d05804f8b5f3c57164c2568`.

For a fresh original capture, install this file at
`tools/behavior-tests/ui/natural_first_city_original.py` in an isolated checkout.
Its imports and relative root then resolve to the versioned adapters alongside
it. Supply original assets, Wine, Xvfb and the pinned Windows Python input
transport as for the unit-menu context recorder. Run `compare.py record` with
these six cases, fresh state and `--repeat 2`; observations must never be edited
to agree with a candidate. No original binaries or asset files are included.

Later recorder experiments do not change the provenance of these accepted
observations. This archive adds no comparison cases or passing totals.
