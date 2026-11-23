# 第三方资料与许可

## Three.js

版本 **0.170.0 / r170**，包括核心模块、OrbitControls 和 BufferGeometryUtils。

Copyright © 2010–2024 three.js authors。采用 MIT 许可证，完整文本随包保存在 [vendor/three/LICENSE](vendor/three/LICENSE)。

## OpenStreetMap

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。`data/landmarks.json` 与 `data/coastline.json` 包含从 OpenStreetMap 提取的轮廓数据，遵循 [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。

- [清真寺建筑轮廓](https://www.openstreetmap.org/way/1081117581)
- [大浴场建筑轮廓](https://www.openstreetmap.org/way/1090339941)，源标签为 `microsoft/BuildingFootprints`
- [现存城墙段](https://www.openstreetmap.org/way/1241211465)

海岸在显示时按约 25 m 间隔采样并平滑；公共建筑采用轮廓的最小外接矩形建模。原始坐标保留在随包 JSON 中。

## 地形

`data/terrain.json` 来自 [Mapzen / AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) 的 Terrarium z13 瓦片。原瓦片地址保留在 JSON 的 `source.tiles` 中。

高程经双线性插值生成 321 × 321 网格；显示时简化海岸，并在三处地标周围作局部台地整平。它表示现代地形，不是 1422 年岸线测绘。

随包保留 [Tilezen 官方地形署名与许可说明](terrain-attribution.md)，[上游版本](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。

## 地图参照与历史资料

`sources/modern-map-reference.png` 为项目提供的现代地图截图，保留图中 Mapbox / OpenStreetMap 标识。路线参照 itiner-e 的 Nicomedia–Artanes 路段；红色城墙范围为小说布局参照。

[土耳其文化旅游部](https://www.kulturportali.gov.tr/turkiye/kocaeli/gezilecekyer/orhan-camii-gazi-suleyman-pasa-camii)用于核对 Orhan Camii / Gazi Süleyman Paşa Camii 的名称与建筑信息；本包不转载其照片或网页。

## 项目代码

项目自有代码尚未指定开源许可证。上述第三方许可证分别适用于其对应代码和资料。
