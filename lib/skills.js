// DSH 运维工作台 —— 技能内容
//
// 技能是给模型看的：告诉它什么时候该用哪个工具、哪些操作危险。
// 与工具的区别：工具会执行，技能只是知识。

export const OPS_GUIDE_SKILL = {
  name: "ops-guide",
  description:
    "DSH 网站运维工作台：全自动建站、服务器环境部署、安全检查与防护，支持 SEO/GEO/代码检查，快照、部署与自动回滚。当使用者问「站现在怎么样」「部署安全吗」「帮我检查一下」「建一个网站」时使用。" +
    "ops_rollback 等工具何时该用、危险操作前该确认什么、部署影响分析怎么看。" +
    "当用户问「站现在怎么样」「能不能部署」「出问题了怎么办」时载入本技能。",
  whenToUse:
    "用户询问站点状态、要部署、要回滚、要排查线上问题时使用。" +
    "纯内容问题（写文章、改文案）不需要本技能。",
  content: `# DSH 運維工作台 使用指南

工作台管 3 个站点：\`oracleluck.com\`（玄学）、\`deepseekbase.com\`（DSH 插件市场）、\`dshio.org\`（标准机构）。

## 零、装完先跑 ops_doctor

工作台依赖一批系统工具（rsync / systemd / curl / tar / gzip / python3）。
**我们自己的机器上早就装好了，但用户装完插件后可能什么都没有。**

所以：**装完插件第一件事是跑 ops_doctor**。

它会检查：
- 主机侧：python3 / rsync / curl / systemctl / tar / gzip / sha256sum 是否装了、版本够不够
- 磁盘空间是否 > 2GB
- 工作台目录是否可写
- 数据库和表结构是否完整
- 检查器和动作注册数量对不对
- 每个站点的 root_path 是否存在、是否可写

输出形如：

    [主机]
      ✓ python3        3.10.12          运行工作台核心
      ✓ rsync          3.2.7            部署时同步文件
      ✗ curl           未安装            检查器抓取页面
          → 执行: apt-get install -y curl

**看到 ✗ 就按提示的安装命令装上，然后重跑 ops_doctor 直到「结论: 环境就绪」。**

用户说「跑不起来」「报错」「缺什么」时，**第一个动作也是跑 ops_doctor**。

## 一、八个工具的分工

| 工具 | 什么时候用 | 会改系统吗 |
|---|---|---|
| \`ops_status\` | 用户问「站怎么样」「有没有问题」 | 否 |
| \`ops_check\` | 要详细检查某一项或全部 | 否 |
| \`ops_snapshot\` | 部署前、改配置前 | 是（但只增不删） |
| \`ops_deploy\` | 要上线改动 | **是，高风险** |
| \`ops_rollback\` | 部署后发现问题 | **是，高风险** |
| \`ops_restart\` | 改了模板/配置要生效 | **是，中风险** |

## 二、危险操作的规矩

### ops_deploy 前必须做

1. **先跑 \`ops_deploy --dry-run\`** —— 看影响分析
2. 读懂「将删除 N 个文件」这段
3. 如果出现「不在源头且不在白名单」的文件，**不要加 --force**，先问用户

**真实事故背景：** 2026-11-09 一次 \`rsync --delete\` 删掉了 3 个静态 JS 文件，导致整个站的手机适配、反馈按钮、PWA 提示全部失效 4 天。工作台的影响分析就是为这个事故加的。

### ops_rollback 前必须做

1. 先 \`ops_rollback --dry-run\`，看会恢复多少、删除多少
2. 确认快照 id 是想要的（\`ops_status\` 里有最近 5 个快照）
3. 回滚也会删除文件（快照里没有的），确认后再执行

### ops_restart 的影响

- \`oracleluck-cms\` 重启约 3-5 秒，期间请求会 502
- 不要在流量高峰做

## 三、检查器清单（15 个）

**部署类**
- \`deploy_smoke\` 关键页可用性
- \`deploy_assets\` 静态资源存在性（这条抓的就是 11-09 那个事故）
- \`deploy_sitemap\` sitemap 合规（5 万 URL / 50MB 上限）

**SEO 类**
- \`seo_title\` 标题（长度、核心词、模板词）
- \`seo_desc\` 描述
- \`seo_canonical\` canonical 自指
- \`seo_hreflang\` hreflang 对称
- \`seo_structured\` JSON-LD 结构化数据

**GEO 类**
- \`geo_ai_crawler\` AI 爬虫放行（robots.txt）
- \`geo_citable\` 内容可摘录性

**代码类**
- \`code_language_mix\` 多语言混入（抓过荷兰语混进中文站的事故）
- \`code_package_clean\` 打包清洁（抓过 .bak 被发上 npm 的事故）
- \`code_secret\` 敏感信息泄漏

**安全类**
- \`sec_fail2ban\` 防爆破
- \`sec_backup\` 备份完整性

## 四、输出怎么读

\`\`\`
deepseekbase.com          web    92 分   ✓
  · SEO 98  ✓  · GEO 80  ⚠  · 安全 95  ✓
  · 部署 3 小时前，smoke 全过
\`\`\`

- ✓ 全部通过
- ⚠ 有警告（不影响使用，但建议修）
- ✗ 有失败（会影响用户）

## 五、什么时候不该用工作台

| 场景 | 该用什么 |
|---|---|
| 改文案、写文章 | 直接编辑，不用工作台 |
| 查数据 | 查数据库，不用工作台 |
| 检查 DSH 插件合规 | \`dshio-check\` 技能 + \`deepseekbase_check\` 工具 |
| 查模型价格 | \`deepseekbase_price\` 工具 |

## 六、故障时怎么排查

1. \`ops_status\` —— 先看哪站红
2. \`ops_check <project>\` —— 看具体哪个检查器失败
3. \`ops_issues <project>\` —— 看历史问题，是不是反复出现
4. 如果是刚部署后出的问题 → \`ops_rollback\`

**不要跳过第 1 步直接回滚** —— 可能问题不在代码，而在服务器或 DNS。
`,
};

export const ALL_SKILLS = [OPS_GUIDE_SKILL];
