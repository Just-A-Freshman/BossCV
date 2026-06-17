# 简易BOSS直聘岗位信息爬虫-使用说明
## 第1步：安装nodejs依赖

检查是否处于`crawler/`目录下，随后按照依赖项：
```bash
npm install
```



## 第2步：安装Chorme浏览器依赖

你需要安装两个插件：

- 篡改猴：请自行在应用商店搜索或直接在此点击下载：
    https://chrome.zzzmh.cn/info/dhdgffkkebhmkfjojejmpbldmpobfkfo

    拓展安装完成后，导入并启用脚本 `extensions/boss-refresh.user.js`

- BOSS直聘 Token 捕获器：进入Chorme的扩展界面，点击左上角**"加载已解压的扩展"**，选择当前目录的`extensions/chrome-extension`文件夹，即完成安装



## 第3步：登录 BOSS直聘

**在Chorme浏览器中登录Boss直聘**。此时由于篡改猴中新增插件的缘故（在右下角有提示），每10s会刷新一次页面。在爬虫结束后请自行在拓展中关闭这个脚本。

PS：该刷新脚本的目的是为了获取Boss直聘定时刷新的Token，并通过**"BOSS直聘 Token 捕获器"**将新的Token信息送给程序，以便进行登录状态下数据的持续爬取。可以说是原始到极致到又简单好用的一种策略了。



## 第4步：启动程序

1. 终端1，运行Token捕获服务，实时更新用户的Token信息：
    ```bash
    node src/token-server.js
    ```
    
2. 终端2，运行真正的爬虫服务：
    ```
    node src/scraper.js
    ```

    



## 搜索关键词调整

编辑 `src/scraper.js` 中的 `CONFIG.apiParams`:

```js
apiParams: {
  city: '101280100',    // 城市代码（101280100 = 广州）
  jobType: '1902',      // 求职类型（1902 = 全职）
  query: 'Agent',       // 搜索关键词
  pageSize: 15,
}
```
