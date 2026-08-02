# 架构拆分计划表（前后端 + CSS/JS 模块化）

## 1. 目标与原则

### 目标
- 把当前“单文件/高耦合”结构，逐步重构为“分层 + 模块化 + 可回滚”的结构。
- 在不停机、不重写业务的前提下，提高可维护性、可测试性和协作效率。

### 原则
- 接口路径不变：先拆文件，不改对外 API。
- 小步提交：每一步都可单独发布和回滚。
- 双轨验证：每步都做“功能回归 + 权限回归 + 启停回归”。
- 先稳后优：先稳定拆分，再做性能与体验优化。

---

## 2. 最终目标架构（目录蓝图）

```text
clue-system/
├─ backend/
│  ├─ src/
│  │  ├─ app.js                        # express app 装配
│  │  ├─ server.js                     # 启动入口（监听端口）
│  │  ├─ config/
│  │  │  ├─ env.js                     # 环境变量校验与默认值
│  │  │  ├─ cors.js                    # CORS/Origin 策略
│  │  │  └─ db.js                      # mysql 连接池
│  │  ├─ common/
│  │  │  ├─ middleware/
│  │  │  │  ├─ auth.js                 # 鉴权中间件
│  │  │  │  ├─ errorHandler.js         # 统一错误处理
│  │  │  │  └─ requestLog.js           # 访问日志
│  │  │  ├─ logger/
│  │  │  │  ├─ accessLogger.js
│  │  │  │  └─ auditLogger.js
│  │  │  ├─ utils/
│  │  │  │  ├─ time.js
│  │  │  │  └─ response.js             # 统一返回体
│  │  │  └─ constants/
│  │  │     ├─ roles.js
│  │  │     └─ errorCodes.js
│  │  ├─ modules/
│  │  │  ├─ auth/
│  │  │  │  ├─ auth.routes.js
│  │  │  │  ├─ auth.controller.js
│  │  │  │  ├─ auth.service.js
│  │  │  │  └─ auth.repository.js
│  │  │  ├─ users/
│  │  │  │  ├─ users.routes.js
│  │  │  │  ├─ users.controller.js
│  │  │  │  ├─ users.service.js
│  │  │  │  └─ users.repository.js
│  │  │  ├─ clues/
│  │  │  │  ├─ clues.routes.js
│  │  │  │  ├─ clues.controller.js
│  │  │  │  ├─ clues.service.js
│  │  │  │  └─ clues.repository.js
│  │  │  ├─ visits/
│  │  │  │  ├─ visits.routes.js
│  │  │  │  ├─ visits.controller.js
│  │  │  │  ├─ visits.service.js
│  │  │  │  └─ visits.repository.js
│  │  │  └─ uploads/
│  │  │     ├─ uploads.routes.js
│  │  │     ├─ uploads.controller.js
│  │  │     └─ uploads.service.js
│  │  └─ bootstrap/
│  │     └─ migrateOnStartup.js        # 启动自检/兼容迁移
│  ├─ tests/
│  │  ├─ auth.test.js
│  │  ├─ clues.test.js
│  │  └─ users.test.js
│  └─ package.json
│
├─ frontend/
│  ├─ src/
│  │  ├─ main.js                       # 页面挂载入口
│  │  ├─ app/
│  │  │  ├─ router.js                  # 若后续引入路由
│  │  │  └─ permissions.js             # 前端权限显示逻辑
│  │  ├─ api/
│  │  │  ├─ http.js                    # fetch/axios 封装
│  │  │  ├─ auth.api.js
│  │  │  ├─ users.api.js
│  │  │  ├─ clues.api.js
│  │  │  └─ visits.api.js
│  │  ├─ stores/
│  │  │  ├─ auth.store.js
│  │  │  ├─ clues.store.js
│  │  │  └─ ui.store.js
│  │  ├─ modules/
│  │  │  ├─ login/
│  │  │  │  ├─ login.view.js
│  │  │  │  └─ login.state.js
│  │  │  ├─ clue-list/
│  │  │  │  ├─ clue-list.view.js
│  │  │  │  ├─ clue-list.filters.js
│  │  │  │  └─ clue-list.actions.js
│  │  │  ├─ visits/
│  │  │  │  ├─ visits.view.js
│  │  │  │  └─ visits.actions.js
│  │  │  └─ settings/
│  │  │     ├─ users-admin.view.js
│  │  │     └─ doctors-admin.view.js
│  │  ├─ components/
│  │  │  ├─ base-button.js
│  │  │  ├─ base-modal.js
│  │  │  ├─ base-table.js
│  │  │  └─ notify.js
│  │  ├─ utils/
│  │  │  ├─ date.js
│  │  │  ├─ format.js
│  │  │  └─ guards.js
│  │  └─ styles/
│  │     ├─ tokens.css                 # 设计变量
│  │     ├─ base.css                   # reset + typography
│  │     ├─ layout.css                 # 顶部、侧边、容器
│  │     ├─ components.css             # 按钮/表格/弹窗
│  │     ├─ pages/
│  │     │  ├─ login.css
│  │     │  ├─ clue-list.css
│  │     │  └─ visits.css
│  │     └─ utilities.css              # 状态与工具类
│  └─ index.html
│
├─ shared/
│  └─ contracts/
│     ├─ auth.contract.js
│     ├─ users.contract.js
│     └─ clues.contract.js
│
├─ scripts/
│  ├─ start-server.bat
│  ├─ stop-server.bat
│  ├─ restart-server.bat
│  └─ run-server.ps1
│
└─ docs/
   ├─ architecture.md
   ├─ api-spec.md
   ├─ role-permission-matrix.md
   └─ release-checklist.md
```

> 说明：这是“目标态”。迁移过程中会先保留根目录现有文件并做兼容入口，再逐步切换。

---

## 3. 分阶段计划表（执行版）

| 阶段 | 时间 | 目标 | 主要动作 | 交付物 | 回滚点 |
|---|---:|---|---|---|---|
| P0 基线冻结 | 0.5 天 | 可回滚基线 | 打 tag、导出 DB 备份、记录当前脚本与配置 | 基线 tag + 备份文件 | 任意阶段可回退到 tag |
| P1 后端壳层拆分 | 1-2 天 | `server.js` 降压 | 拆出 `config`、`common/middleware`、`common/utils`，保持路由逻辑不变 | `backend/src/app.js` 初版 + 公共模块 | 切回旧入口文件 |
| P2 后端业务模块化 | 3-5 天 | 按域拆模块 | 把 auth/users/clues/visits/uploads 拆成 route/controller/service/repository | `backend/src/modules/*` | 保留兼容路由聚合层 |
| P3 前端 API 与状态拆分 | 2-3 天 | 降低 `index.html` 复杂度 | 抽 `api/http.js`、`api/*.api.js`、`stores/*` | 前端请求与状态独立文件 | 页面仍可回退到旧脚本 |
| P4 CSS 模块化 | 1-2 天 | 样式可维护 | 抽 `styles/tokens/base/layout/components/pages` | 样式分层文件 | 合并回 `index.html` style 块 |
| P5 前端业务模块化 | 3-4 天 | 页面逻辑可扩展 | 按登录、线索、回访、设置拆 `modules/*` | 页面业务模块文件 | 保留旧函数适配层 |
| P6 契约与测试 | 2-3 天 | 稳定发布 | 统一响应结构、补关键接口测试、权限回归用例 | `shared/contracts` + `tests` | 关闭新校验开关 |
| P7 发布与观测 | 1 天 | 平滑上线 | 灰度发布、错误率监控、日志检查 | 发布记录 + 回归报告 | 快速回滚脚本 |

---

## 4. CSS 模块拆分计划（细项）

| 模块 | 包含内容 | 从现有页面迁移来源 | 验收标准 |
|---|---|---|---|
| `tokens.css` | 色板、字号、间距、圆角、阴影、层级 | 现有内联 style 中硬编码值 | 新样式不再硬编码颜色/间距 |
| `base.css` | reset、基础标签样式、字体 | 全局 body/h1/input/button 样式 | 页面无“默认浏览器样式”回退 |
| `layout.css` | 头部、筛选容器、主内容网格 | 顶部与列表布局代码 | 移动端与桌面布局均正常 |
| `components.css` | 按钮、表格、表单、弹窗、徽标 | 复用 UI 样式段 | 组件跨页面复用不重复定义 |
| `pages/*.css` | 登录页、线索页、回访页差异样式 | 各区域专属样式 | 页面私有样式不污染全局 |
| `utilities.css` | `is-loading/is-disabled/is-error` 等 | 零散状态类 | 状态切换不依赖行内 style |

---

## 5. JS 模块拆分计划（细项）

| 模块 | 职责 | 迁移动作 | 验收标准 |
|---|---|---|---|
| `api/http.js` | 统一请求、token 注入、错误拦截 | 迁移所有 `fetch` 封装 | 全站请求走统一入口 |
| `api/*.api.js` | 按业务域定义接口 | 登录/线索/回访/用户拆分 | 组件不再直写 URL |
| `stores/*` | 集中状态（用户、筛选、分页、UI） | 提升共享状态出页面函数 | 跨模块读写状态一致 |
| `app/permissions.js` | 前端权限显示策略 | 迁移 `role` 判断分支 | 模板中权限判断集中调用 |
| `modules/*` | 页面业务动作与视图组合 | 从巨型脚本按功能切块 | 每个模块可单测 |
| `utils/*` | 日期、格式化、防抖、守卫 | 抽公共函数 | 无重复工具函数实现 |

---

## 6. 关键风险与规避

1. 角色权限回归风险
- 规避：后端权限为唯一真源，前端仅做显示控制；关键接口加权限测试。

2. CORS 与域名策略误配
- 规避：来源白名单集中在 `config/cors.js`，禁止散落在业务代码。

3. 脚本编码与 Windows 兼容问题
- 规避：统一 `chcp 65001`，批处理输出不使用异常字符。

4. 重构期间线上稳定性风险
- 规避：保留旧入口与适配层，采用灰度开关逐步切流。

---

## 7. 每阶段验收清单（必过）

- 功能回归：登录、列表、新增、编辑、分配、回访、导入导出。
- 权限回归：主管/超级管理员/咨询/套电/医助/运营 六角色。
- 启停回归：start/stop/restart 全链路可用，无需手工 Ctrl+C。
- 观测回归：错误日志、访问日志、鉴权失败日志可追踪。
- 性能回归：首页加载、列表查询、保存操作不劣化。

---

## 8. 建议的首批落地任务（本周可执行）

1. 建立 `backend/src` 壳层与兼容入口（不改接口）。
2. 把鉴权与 CORS 从主文件抽到 `common/middleware` 与 `config/cors`。
3. 抽前端 `api/http.js` 与 `api/auth.api.js`，替换登录与列表请求。
4. 抽 `styles/tokens.css` + `styles/components.css`，先替换按钮/表单/表格。
5. 增加最小接口回归测试：`/api/login`、`/api/list`、`/api/updateClue`。

完成以上 5 项后，代码结构会显著清晰，且不会影响现网使用方式。
