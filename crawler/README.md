# BOSS直聘岗位信息爬虫 — 使用说明

## 第1步：安装依赖

确保在 `crawler/` 目录下：
```bash
npm install
```



## 第2步：安装 Chrome 扩展

1. 打开 Chrome → `chrome://extensions`
2. 开启右上角的 **"开发者模式"**
3. 点击左上角 **"加载已解压的扩展"**
4. 选择 `chrome-extension` 目录

> 扩展的作用：从浏览器请求中自动捕获 cookies、zp_token、token 等认证信息，并发送给爬虫程序。
>
> **注意：扩展会每 10 秒自动刷新一次 zhipin.com 页面来保持 token 新鲜，这是正常的。**



## 第3步：登录 BOSS直聘

在同一个 Chrome 浏览器中打开 [Boss直聘](https://www.zhipin.com) 并登录，**切换到【职位】页面**，保持打开状态。由于第2步扩展的缘故，页面会**每10秒自动刷新一次**，以保持token新鲜。这是正常现象，只需在爬虫后关闭拓展即可不再刷新。可以把 zhipin 标签页放到一个单独的窗口里，不影响你浏览其他网页。



## 第4步：运行爬虫

在终端运行：
```bash
node src/scraper.js
```

爬虫运行完成后，按 **Ctrl+C** 停止。爬取数据会输出到： `data/jobs.json`



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

常用城市代码：广州 `101280100`、深圳 `101280600`、北京 `101010100`、上海 `101020100`

