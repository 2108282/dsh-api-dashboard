# 市场收录与权限说明

本插件面向 DeepSeek Harness Web / Android DSHA，同时包含桌面和平板布局。不是OpenAI、Claude或其他平台自身的浏览器插件；不冒充官方插件。

## 当前收录

截至2026-10-10公开目录核查，下列社区渠道已有条目，无需重复申请：

- [DSH Plugin Hub](https://dsh-plugin.org/zh/plugins/133563825as-ai/dsh-api-dashboard)（独立社区项目，非DeepSeek官方市场）
- [vbarter / dsplugin.app](https://github.com/vbarter/dsh-plugin-registry)
- [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com/p/133563825as-ai/dsh-api-dashboard/)及消费其目录的dsh-market
- [DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace)
- [dshplugin.store](https://www.dshplugin.store/plugin/133563825as-ai/dsh-api-dashboard)

这些目录当前多显示1.6.9。新Release和npm发布后，各市场按自身定时任务、PR和人工审核刷新，不能保证立即同步。目录的“已验证”可能只验证manifest/来源，不能解读为完整安装、运行或安全审计。

## 还未收录/未精选

- [DSH-Store](https://github.com/AI-Scarlett/DSH-Store)：原ysr666地址已迁移。当前索引/候选库未找到项目。 [申请表](https://github.com/AI-Scarlett/DSH-Store/issues/new?template=plugin-submission.yml)按固定commit审查。
- [bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin)：全量目录已核准，但精选桌面市场未列入；是否精选需其维护者决定。
- [Noob Plugin Console](https://github.com/Noob-stupid/dsh-plugin-gating-hub)：当前有限静态榜单未找到；topic可被搜索发现，不保证进入榜单。

本轮准备了收录材料，没有批量发Issue或向第三方维护者发送推广消息。申请不等于已批准，收录也不等于活跃使用量。

## 兼容证据

- 当前验收：DSH **0.2.0-rc.2**，Android Ubuntu容器，Node24，Web profile。来源安装、可见UI、设置读写及用户真机反馈已确认；不是覆盖所有模型/端点的完整平台测试。
- 0.1.x声明范围保留，但本轮未做旧宿主真机完整验收。
- 其他DSH精确发行、Node版本、桌面系统：没有完整运行验收时应保持unknown，不仅因为范围匹配就标verified。
- 手机/平板/桌面断点有渲染结构和设备矩阵回归；本轮用户真机验收是Android手机，不把它说成全部桌面设备实测。

## 权限与行为

- 凭据：只读取环境变量/DSH凭据系统中已有API Key引用，或已有自定义平台设置；不向浏览器下发明文Key。
- 网络：请求平台余额API、用户填写的自定义平台地址；检查更新访问本项目GitHub，下载本项目固定Release/频道归档；Android通知/打开链接访问本地App桥。
- 文件：保存插件本地设置（可能含用户自定义Key，权限0600），读取相关profile配置/投影缓存。自更新会备份并替换本插件目录。
- 命令：自更新使用tar、Node语法预检及锁探测；不修改DSH官方组件，不清除用户对话，不卸载其他插件。
- 生命周期：manifest未声明preinstall/install/postinstall/prepare，不执行自动安装脚本；dependencies保持为空，宿主提供optional peers。

因此本插件不能标为“无网络/无文件/无凭据访问”的低风险项目。DSH-Store严格自动批准可能拒绝、隔离或只提供外链，这是其策略边界，不能为通过门禁隐藏真实能力或绕过审核。

## 可提交的申请内容

标题：`收录申请：dsh-api-dashboard 1.7.0（余额与会话用量看板，Web/手机/平板/桌面）`

项目地址：`https://github.com/133563825as-ai/dsh-api-dashboard`

Plugin path：仓库根目录。

说明：标准DSH Bundle，MIT；提供多平台余额/用量、当前会话子代理、响应式布局。支持范围、精确0.2.0-rc.2证据及权限见本页；带凭据/网络/本地状态/自更新行为，不宣称无权限或独立安全审核。请求按固定1.7.0 commit预检，若不符合受保护安装目录，请明确展示外链/候选状态。
