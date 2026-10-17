---
name: amap-map-agent-skills
description: 高德官方 Map Agent Skills 的本地入口。当前随包保存的官方能力仅包含 Google Maps → AMap 迁移 Skill；不得把它误当成通用 POI/路线 Agent 工具。Google Maps 迁移时加载本目录 official/amap-map-google-maps-migration/SKILL.md。
license: MIT
version: 1.0.0-bundled
---

# AMap Map Agent Skills — Bundle Router

## Current bundled capability

本次用户提供的 `amap-map-agent-skills-main.zip` 当前只包含：

- `amap-map-google-maps-migration`

因此本 Skill **只负责识别并路由 Google Maps → 高德地图迁移任务**。

不要声称当前包已经提供独立的通用 POI 查询、路径规划、地理编码 Agent Skill。

## Routing

当任务涉及：

- 从 Google Maps JavaScript API 迁移到 AMap JSAPI
- Google Places / Directions / Geocoding 等接口映射到高德
- Google 与高德坐标顺序、参数、返回结构差异

必须继续加载：

`official/amap-map-google-maps-migration/SKILL.md`

并按其 references 执行。

## General AMap development

如果任务是普通高德前端开发，而不是 Google Maps 迁移：

- 地图视觉/业务表达 → `amap-design-skill`
- AMap JSAPI v2.0、Marker、Polyline、POI、路线、地理编码等实现 → `amap-jsapi-skill`

## Future upstream updates

如果未来官方 `amap-map-agent-skills` 仓库新增更多独立 Skill，应逐个作为可发现能力登记；不要仅因为仓库名是复数就推断某项能力已经存在。
