import {
  Plugin,
  fetchPost,
  confirm,
  fetchSyncPost,
  openTab,
  Dialog,
  openMobileFileById,
  getFrontend
} from "siyuan";
import "@/index.scss";
import { Md5 } from "ts-md5";
import TurndownService from 'turndown';
import moment from "moment";
let onSyncEndEvent: EventListener;
const STORAGE_NAME = "flomo-sync-config";
const FLOMO_ASSETS_DIR = "assets/flomo";
const DIDA_API_BASE = "https://api.dida365.com/open/v1";
const USG = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.76";
const flomoSvg = '<svg t="1701609878223" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4530" width="200" height="200"><path d="M0 0h1024v1024H0z" fill="#FAFAFA" p-id="4531"></path><path d="M709.461 507.212H332.07V399.559h447.497l-65.422 105.264c0 2.389-2.342 2.389-4.684 2.389z m98.143-167.462H450.067l65.441-105.273c2.342 0 4.675-2.39 7.016-2.39h355.177l-65.422 105.264c0 2.399-2.342 2.399-4.684 2.399z" fill="#30CF79" p-id="4532"></path><path d="M337.91 791.912c-105.159 0-191.62-88.519-191.62-196.181s86.461-196.172 191.62-196.172c105.15 0 191.621 88.51 191.621 196.172s-86.47 196.172-191.62 196.172z m0-282.31c-46.743 0-86.47 38.276-86.47 88.518 0 47.853 37.394 88.529 86.47 88.529 49.067 0 86.462-38.286 86.462-88.529-2.342-50.242-39.727-88.519-86.471-88.519z" fill="#30CF79" p-id="4533"></path></svg>'
const outOfSyncSvg = '<svg t="1702561931653" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="17063" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200"><path d="M624 706.3h-74.1V464c0-4.4-3.6-8-8-8h-60c-4.4 0-8 3.6-8 8v242.3H400c-6.7 0-10.4 7.7-6.3 12.9l112 141.7c3.2 4.1 9.4 4.1 12.6 0l112-141.7c4.1-5.2 0.4-12.9-6.3-12.9z" p-id="17064"></path><path d="M811.4 366.7C765.6 245.9 648.9 160 512.2 160S258.8 245.8 213 366.6C127.3 389.1 64 467.2 64 560c0 110.5 89.5 200 199.9 200H304c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8h-40.1c-33.7 0-65.4-13.4-89-37.7-23.5-24.2-36-56.8-34.9-90.6 0.9-26.4 9.9-51.2 26.2-72.1 16.7-21.3 40.1-36.8 66.1-43.7l37.9-9.9 13.9-36.6c8.6-22.8 20.6-44.1 35.7-63.4 14.9-19.2 32.6-35.9 52.4-49.9 41.1-28.9 89.5-44.2 140-44.2s98.9 15.3 140 44.2c19.9 14 37.5 30.8 52.4 49.9 15.1 19.3 27.1 40.7 35.7 63.4l13.8 36.5 37.8 10C846.1 454.5 884 503.8 884 560c0 33.1-12.9 64.3-36.3 87.7-23.4 23.4-54.5 36.3-87.6 36.3H720c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h40.1C870.5 760 960 670.5 960 560c0-92.7-63.1-170.7-148.6-193.3z" p-id="17065"></path></svg>'
export default class FlomoSync extends Plugin {
  private isMobile: boolean;
  private siyuanStorage;
  private topBarElement;
  private syncing: boolean = false;
  async pushMsg(msg) {
    fetchPost("/api/notification/pushMsg", { msg: msg });
  }

  async pushErrMsg(msg) {
    fetchPost("/api/notification/pushErrMsg", { msg: msg });
  }

  async getLocalStorage() {
    return await fetchSyncPost("/api/storage/getLocalStorage");
  }

  /**
   * 
   * @param type
   * @returns 
   */
  getSvgHTML(type){
    let svg;
    if(type === "flomo"){
      svg = flomoSvg
    }else if(type === "outOfSync"){
      svg = outOfSyncSvg
    }else if(type === "iconRefresh"){
      svg = '<svg><use xlink:href="#iconRefresh"></use></svg>'
    } 

    if(this.isMobile){
     svg = svg + '<span class="b3-menu__label">flomo+滴答同步</span>'
    }
    return svg;
  }

/**
 * 
 * @param callFun 将回调变为异步函数
 * @param success 
 * @param fail 
 * @param args 
 * @returns 
 */
  async waitFunction(callFun, success, fail, ...args) {
    return new Promise((resolve) => {
      callFun(...args, (...result) => {
        resolve(success(...result));
      }, (...result) => {
        resolve(fail(...result));
      });
    });
  }
  /**
   * 获取所有记录：上次同步时间作为起点
   */
  async getLatestMemos() {
    let allRecords = [];
    let syncSuccessTag = this.data[STORAGE_NAME]["syncSuccessTag"]
    let lastSyncTime = this.data[STORAGE_NAME]["lastSyncTime"]

    let syncTagMode = this.data[STORAGE_NAME].syncTagMode;
    let syncIncludeTags = this.data[STORAGE_NAME].syncIncludeTags;//包含标签字符串
    let syncExcludeTags = this.data[STORAGE_NAME].syncExcludeTags;//排除标签字符串

    let syncIncludeTagsArr = syncIncludeTags === "" ? [] : syncIncludeTags.split(/\s+/)
    let syncExcludeTagsArr = syncExcludeTags === "" ? [] : syncExcludeTags.split(/\s+/)


    const LIMIT = "200";
    let today = new Date();
    //只能是指定时间或今天00:00:00
    let latest_updated = moment(lastSyncTime, 'YYYY-MM-DD HH:mm:ss').toDate()
      || moment(today, 'YYYY-MM-DD 00:00:00').toDate()
    let latest_updated_at_timestamp;
    let latest_slug = "";
    
    while (true) {
      try {
        latest_updated_at_timestamp = (Math.floor(latest_updated.getTime()) / 1000).toString();
        let ts = Math.floor(Date.now() / 1000).toString();
        // let signString;
        // if (!latest_slug) {
        //   signString = `api_key=flomo_web&app_version=2.0&latest_updated_at=${latest_updated_at_timestamp}&limit=${LIMIT}&timestamp=${ts}&tz=8:0&webp=1dbbc3dd73364b4084c3a69346e0ce2b2`
        // } else {
        //   signString = `api_key=flomo_web&app_version=2.0&latest_slug=${latest_slug}&latest_updated_at=${latest_updated_at_timestamp}&limit=${LIMIT}&timestamp=${ts}&tz=8:0&webp=1dbbc3dd73364b4084c3a69346e0ce2b2`
        // }
        // let sign = new Md5().appendStr(signString).end();        
        // let url = "https://flomoapp.com/api/v1/memo/updated/?limit=" + LIMIT + "&latest_updated_at=" + latest_updated_at_timestamp + "&latest_slug=" + latest_slug + "&tz=8:0&timestamp=" +
        //   ts + "&api_key=flomo_web&app_version=2.0&webp=1&sign=" + sign;

        let param = {
          api_key: "flomo_web",
          app_version: "2.0",
          latest_slug: latest_slug,
          latest_updated_at: latest_updated_at_timestamp,
          limit: LIMIT,
          timestamp: ts,
          tz: "8:0",
          webp: "1"
        }
        param["sign"] = this.createSign2(param);
        let url = new URL("https://flomoapp.com/api/v1/memo/updated");
        url.search = new URLSearchParams(param).toString();

        let response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.data[STORAGE_NAME]["accessToken"]}`,
            'Content-Type': 'application/json',
            'User-Agent': USG
          },
        })
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        // if (data.code !== 0) {
        //   throw new Error(`错误: ${data.message}`);
        // }
        
        if (this.check_authorization_and_reconnect(data)) {
          // console.log(data);
          let records = data["data"];
          let noMore = records.length < LIMIT;
          if (records.length == 0) {
            break
          }
          latest_updated = moment(records[records.length - 1]["updated_at"], 'YYYY-MM-DD HH:mm:ss').toDate()
          latest_slug = records[records.length - 1]["slug"]

          //过滤已删除的（回收站的）,过滤包含同步标识的
          allRecords = allRecords.concat(records.filter(record => {
            return !record["deleted_at"] && !record["tags"].includes(syncSuccessTag);
          }));

          // 过滤标签
          if (syncTagMode === "0") {
            // 排除同步标签
            allRecords = allRecords.filter(record => {
              let memoTags = record["tags"];
              if (memoTags.length == 0) {
                return true
              }

              return syncExcludeTagsArr.every(myTag => memoTags.includes(myTag) == false)
            });

          } else {// if(syncTagMode === "1"){
            // 包含同步标签
            allRecords = allRecords.filter(record => {
              let memoTags = record["tags"];
              return syncIncludeTagsArr.some(myTag => memoTags.includes(myTag))
            });
          }

          if (noMore) { //没有更多了
            break
          }
        } else {
          throw new Error(`flomo登录校验失败`);
        }

      } catch (error) {
        await this.pushErrMsg("plugin-flomo-sync:" + "请检查错误：" + error)
        throw new Error(`${error}`);
      }
    }

    return allRecords;
  }


  /**
   * 开始同步（flomo + 滴答清单）
   */
  async runSync() {
    // 防止快速点击、或手动和自动运行冲突。
    if (this.syncing == true) {
      // console.log("plugin-flomo-sync:" + "正在同步，请稍后")
      return;
    }

    this.syncing = true;
    let runBeforeSvg = this.topBarElement.innerHTML;
    try {
      await this.initData();

      //正在执行的图标
      this.topBarElement.innerHTML = this.getSvgHTML("iconRefresh")

      const cfg = this.data[STORAGE_NAME];
      const hasFlomo = !!(cfg.accessToken || (cfg.username && cfg.password));
      const hasDida = !!(cfg.didaEnabled && cfg.didaToken);

      // flomo / 滴答互不影响：一侧失败另一侧仍继续
      if (hasFlomo) {
        try {
          let memos = await this.getLatestMemos();
          if (memos.length == 0) {
            let nowTimeText = moment().format('YYYY-MM-DD HH:mm:ss');
            console.warn("plugin-flomo-sync:" + "flomo暂无新数据-" + nowTimeText)
          } else {
            let { contentArr, imgs } = this.handleMarkdown(memos)
            let handleImgSuccess = await this.downloadImgs(imgs)
            let handleContentSuccess;
            if (handleImgSuccess) {
              handleContentSuccess = await this.writeSiyuan(contentArr);
            }
            if (handleContentSuccess && handleImgSuccess) {
              await this.writeBackTag(memos);
            }
            await setTimeout(async () => {
              let nowTimeText = moment().format('YYYY-MM-DD HH:mm:ss');
              this.data[STORAGE_NAME]["lastSyncTime"] = nowTimeText;
              await this.saveData(STORAGE_NAME, this.data[STORAGE_NAME]);
            }, 1000)
          }
        } catch (flomoErr) {
          console.error("plugin-flomo-sync:flomo同步失败", flomoErr);
          await this.pushErrMsg("plugin-flomo-sync:flomo同步失败：" + flomoErr);
        }
      }

      if (hasDida) {
        try {
          await this.runDidaSync();
        } catch (didaErr) {
          console.error("plugin-flomo-sync:滴答同步失败", didaErr);
          await this.pushErrMsg("plugin-flomo-sync:滴答同步失败：" + didaErr);
        }
      }

      if (!hasFlomo && !hasDida) {
        await this.pushErrMsg("plugin-flomo-sync:请至少配置 flomo 账号，或启用滴答同步并填写 Token");
      }

      //完成后图标
      this.topBarElement.innerHTML = this.getSvgHTML("flomo")
    } catch (error) {
      //报错图标就恢复成之前的状态
      this.topBarElement.innerHTML = runBeforeSvg
      throw new Error(error)
      // this.syncing = false;
    } finally {
      this.syncing = false;
    }

  }

  /** 规范化滴答 Token（去掉误粘贴的 Bearer 前缀与空白） */
  getDidaToken() {
    let token = String(this.data[STORAGE_NAME].didaToken || "").trim();
    if (/^bearer\s+/i.test(token)) {
      token = token.replace(/^bearer\s+/i, "").trim();
    }
    return token;
  }

  /**
   * 请求滴答 Open API。
   * 优先走思源 forwardProxy（避免 CORS/前端拦截），失败再直连。
   */
  async didaRequest(path: string, method: string = "GET", body: any = undefined) {
    const url = DIDA_API_BASE + path;
    const token = this.getDidaToken();
    if (!token) {
      throw new Error("滴答 API Token 为空");
    }

    const proxyPayload: any = {
      url,
      method,
      timeout: 20000,
      contentType: "application/json",
      headers: [{ Authorization: `Bearer ${token}` }],
      responseEncoding: "text",
    };
    if (body !== undefined) {
      proxyPayload.payload = body;
    } else {
      // GET 不要带 JSON body，避免部分网关异常
      proxyPayload.payload = "";
      proxyPayload.payloadEncoding = "text";
    }

    try {
      const proxyRes = await fetchSyncPost("/api/network/forwardProxy", proxyPayload);
      if (proxyRes.code !== 0) {
        throw new Error(proxyRes.msg || "forwardProxy 返回非 0");
      }
      const result = proxyRes.data;
      if (!result) {
        throw new Error("forwardProxy 无 data");
      }
      const status = result.status ?? result.StatusCode ?? 0;
      if (status >= 400) {
        throw new Error(`HTTP ${status} body=${result.body}`);
      }
      if (!result.body && status >= 200 && status < 300) {
        return null;
      }
      if (typeof result.body === "string") {
        const text = result.body.trim();
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          return result.body;
        }
      }
      return result.body;
    } catch (proxyErr) {
      // 回退直连
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        const opts: RequestInit = { method, headers };
        if (body !== undefined) {
          opts.body = JSON.stringify(body);
        }
        const response = await fetch(url, opts);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (response.status === 204) {
          return null;
        }
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      } catch (directErr) {
        throw new Error(`滴答 API 失败 path=${path} proxy=${proxyErr} direct=${directErr}`);
      }
    }
  }

  /**
   * 拉取收集箱未同步任务
   */
  async getInboxTasks() {
    try {
      let data = await this.didaRequest("/project/inbox/data", "GET");
      let tasks = (data && Array.isArray(data.tasks)) ? data.tasks : [];

      // 部分账号下 inbox/data 异常时，回退 undone 接口
      if (tasks.length === 0) {
        try {
          const undone = await this.didaRequest("/task/undone", "POST", { projectIds: ["inbox"] });
          if (Array.isArray(undone)) {
            tasks = undone;
          } else if (undone && Array.isArray(undone.tasks)) {
            tasks = undone.tasks;
          }
        } catch (undoneErr) {
          console.warn("plugin-flomo-sync:task/undone 回退失败", undoneErr);
        }
      }

      const lastSyncRaw = this.data[STORAGE_NAME].didaLastSyncTime;
      const lastSyncTime = moment(lastSyncRaw, "YYYY-MM-DD HH:mm:ss", true);

      const filtered = tasks.filter((task) => {
        if (task.status === 2) {
          return false;
        }
        // 仅当任务自带时间字段时才按「上次同步时间」过滤；避免 moment(undefined)=现在 的误判
        const rawTime = task.createdTime || task.modifiedTime;
        if (rawTime && lastSyncTime.isValid()) {
          const tTime = moment(rawTime);
          if (tTime.isValid() && tTime.isBefore(lastSyncTime)) {
            return false;
          }
        }
        return true;
      });

      console.log(`plugin-flomo-sync:滴答收集箱原始 ${tasks.length} 条，过滤后 ${filtered.length} 条`);
      return filtered;
    } catch (error) {
      await this.pushErrMsg("plugin-flomo-sync:滴答清单拉取失败：" + error);
      throw error;
    }
  }

  /** 解析滴答任务建立时间（优先 createdTime，与 flomo 前缀风格一致） */
  getDidaTaskCreatedTime(task) {
    const raw = task.createdTime || task.modifiedTime;
    const m = raw ? moment(raw) : null;
    if (m && m.isValid()) {
      return m.format("YYYY-MM-DD HH:mm");
    }
    return moment().format("YYYY-MM-DD HH:mm");
  }

  /** 滴答任务转纯文字（不用 markdown 列表，不加来源备注） */
  handleDidaMarkdown(tasks) {
    let contentArr = [];
    tasks.forEach((task) => {
      const timeStr = this.getDidaTaskCreatedTime(task);
      const title = (task.title || "").trim();
      const desc = (task.content || "").trim();
      let text = `${timeStr} ${title}`.trim();
      if (desc) {
        text += "\n" + desc;
      }
      contentArr.push(text);
    });
    return contentArr;
  }

  /** 同步成功后删除滴答原任务 */
  async deleteDidaTasks(tasks: any[]) {
    for (const task of tasks) {
      if (!task?.id) {
        continue;
      }
      const projectId = task.projectId || "inbox";
      await this.didaRequest(`/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(task.id)}`, "DELETE");
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  /** 执行滴答清单收集箱同步 */
  async runDidaSync() {
    if (!this.data[STORAGE_NAME].didaEnabled) {
      return;
    }
    if (!this.getDidaToken()) {
      await this.pushErrMsg("plugin-flomo-sync:已启用滴答同步但 Token 为空");
      return;
    }

    let tasks = await this.getInboxTasks();
    if (tasks.length === 0) {
      const tip = "滴答收集箱暂无待同步任务（可将「滴答上次同步时间」调早后重试）。";
      console.warn("plugin-flomo-sync:" + tip);
      await this.pushMsg("plugin-flomo-sync:" + tip);
      return;
    }

    let contentArr = this.handleDidaMarkdown(tasks);
    let ok = await this.writeSiyuan(contentArr);
    if (ok) {
      try {
        await this.deleteDidaTasks(tasks);
      } catch (delErr) {
        console.warn("plugin-flomo-sync:删除滴答原任务失败（内容已写入思源）", delErr);
        await this.pushErrMsg("plugin-flomo-sync:内容已写入思源，但删除滴答原任务失败：" + delErr);
      }
      this.data[STORAGE_NAME]["didaLastSyncTime"] = moment().format("YYYY-MM-DD HH:mm:ss");
      await this.saveData(STORAGE_NAME, this.data[STORAGE_NAME]);
      await this.pushMsg(`plugin-flomo-sync:滴答清单已同步 ${tasks.length} 条，并已删除原任务`);
    } else {
      await this.pushErrMsg("plugin-flomo-sync:滴答清单写入思源失败");
    }
  }


  /**把内容写进今日日记中 */
  async writeSiyuan(contentArr: string[]) {
    try {
      let targetPage = await this.getTargetPage();
      for (let blockContent of contentArr) {
        let url = "/api/block/appendBlock"
        let data = {
          "data": blockContent,
          "dataType": "markdown",
          "parentID": targetPage
        }

        let rs = await fetchSyncPost(url, data);
        if (rs.code != 0) {
          console.log("plugin-flomo-sync:" + rs.msg);
        }
      }
      //写入后打开今日页面
      if (this.isMobile) {
        openMobileFileById(this.app, targetPage)
      } else {
        openTab({ app: this.app, doc: { id: targetPage } });
      }
    } catch (error) {
      console.error("plugin-flomo-sync:" + error);
      return false
    }
    return true
  }

  /**
   * 获取指定页面
   */
  async getTargetPage() {
    let locationMode = this.data[STORAGE_NAME].locationMode;
    let targetPage = this.data[STORAGE_NAME].pageId;
    let notebook = this.data[STORAGE_NAME].dailnoteNotebook;//指定的笔记本
    if (locationMode === "0") {
      if (!notebook) {
        //指定的笔记本为空就使用默认的笔记本
        notebook = this.siyuanStorage["local-dailynoteid"];
      }

      // 获取今日文档id
      let todayId = await this.getTodayId(notebook);
      targetPage = todayId
    }
    return targetPage
  }

  /**
   * 获取今日id
   * @param notebook 笔记本id
   * @returns 
   */
  async getTodayId(notebook) {
    let response = await fetchSyncPost("/api/filetree/createDailyNote", { notebook: notebook })
    return response["data"]["id"];
  }


  /**根据待同步的内容，生成markdown */
  handleMarkdown(memos) {
    const LIST_MAX_NUM = 50;//多少条作为一个列表，列表太长容易卡顿。
    let blockContent = '';
    let imgs = [];
    let contentArr = []
    memos.every((memo, idx) => {
      let content = memo.content;
      // 添加编辑时间到内容前面
      let editTime = moment(memo.updated_at).format("YYYY-MM-DD HH:mm");
      
      let files = memo.files;
      // 图片markdown
      imgs = imgs.concat(files);
      files.forEach(img => {
        let imgName = img["name"];
        if (!(imgName.endsWith(".png") || imgName.endsWith(".png") || imgName.endsWith(".gif"))) {
          imgName = imgName + '.png'
        }
        let imgMd = "![" + img["name"] + "](" + FLOMO_ASSETS_DIR + "/" + img["id"] + "_" + imgName + ") ";
        // console.log(imgMd)
        content += imgMd
      })
      content = content.trim()
      content = new TurndownService().turndown(content);
      content = content.replaceAll('\\\[', '[').replaceAll('\\\]', ']').replaceAll('\\\_', '_').replaceAll(/(?<=#)(.+?)(?=\s)/g, "$1#");
      
      // 将时间添加到内容前面
      content = `${editTime} ${content}`;
      
      content = content.split("\n").reduce((result, line) => {
        if (line.trim() == "") {
          line = ""
        }
        return result + "\t" + line + "\n"
      }, "")

      blockContent += '*  \n' + content;
      if (((idx + 1) % LIST_MAX_NUM == 0) || (idx + 1 == memos.length)) {
        // 开始分隔        
        blockContent = blockContent.replace(/\n*$/g, "").replace(/^\n*/g, "")
        contentArr.push(blockContent)
        blockContent = ""
      }

      return true;
    })

    // blockContent = blockContent.replace(/\n*$/g, "").replace(/^\n*/g, "")
    return { contentArr, imgs }
  }


  /**
   * 
   * @param imgs 下载图片到思源
   */
  async downloadImgs(imgs) {
    // 处理图片逻辑
    try {
      imgs.every(async img => {
        let imgName = img["name"];
        if (!(imgName.endsWith(".png") || imgName.endsWith(".png") || imgName.endsWith(".gif"))) {
          imgName = imgName + '.png'
        }

        let imgPath = "data/" + FLOMO_ASSETS_DIR + "/" + img["id"] + "_" + imgName;
        let imgRespon = await fetch(img["url"]);
        let fileBlob = await imgRespon.blob();
        // console.log(fileBlob);
        // console.log(imgPath);
        await this.addFile(imgPath, fileBlob);
        return true
      })
    } catch (error) {
      await this.pushErrMsg("plugin-flomo-sync:" + error)
      return false;
    }
    return true;
  }

  async addFile(f, file) {
    const fd = new FormData();
    fd.append('path', f);
    fd.append('isDir', 'false');
    fd.append('file', file);
    return await fetch('/api/file/putFile', {
      method: 'POST',
      body: fd
    });
  }

  /**
   * 
   * @param memos 回写标签到flomo：标识已同步
   * @param syncSuccessTag 
   */
  async writeBackTag(memos: any[]) {
    let syncSuccessTag = this.data[STORAGE_NAME]["syncSuccessTag"]
    if (!syncSuccessTag) {
      return
    }

    // let config = this.data[STORAGE_NAME];
    let baseUrl = "https://flomoapp.com/api/v1/memo"
    memos.every(async memo => {
      let nowTime = Date.now();
      let timestamp = Math.floor(nowTime / 1000).toFixed();
      // console.log("最后回写标签时间");
      // console.log(new Date(nowTime));
      let url = baseUrl + "/" + memo["slug"];
      // let sign = this.createSign(config.username, config.password, timestamp);
      let addTag1 = `<p>#${syncSuccessTag} `
      let addTag2 = `<p>#${syncSuccessTag} </p>`
      let content = memo["content"].includes("<p>") ?
        memo["content"].replace("<p>", addTag1) :
        addTag2.concat(memo["content"])
      let file_ids = memo["files"].map(file => file.id);
      let data = {
        api_key: "flomo_web",
        app_version: "2.0",
        content: content,
        created: memo["created"],
        file_ids: file_ids,
        local_updated_at: timestamp,
        platform: "web",
        // sign: sign,
        timestamp: timestamp,
        tz: "8:0",
        webp: "1"
      }
      data["sign"] = this.createSign2(data);
      let response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.data[STORAGE_NAME]["accessToken"]}`,
          'Content-Type': 'application/json',
          'User-Agent': USG
        },
        body: JSON.stringify(data)
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const resPon = await response.json();
      // debugger;
      if (this.check_authorization_and_reconnect(resPon)) {
        // console.log(resPon);
      }
      // 处理逻辑：间隔1秒发请求，防止太快
      setTimeout(() => { }, 1000)
    })
  }

  /**
   * 处理监听同步事件
   * @param detail 
   */
  async eventBusHandler(detail) {
    // await this.runSync();
    //获取flomo是否有新数据。
    await this.checkNew()
  }


  async checkNew() {
    try {
      const cfg = this.data[STORAGE_NAME];
      let hasNew = false;
      if (cfg.accessToken || (cfg.username && cfg.password)) {
        let memos = await this.getLatestMemos();
        if (memos.length > 0) {
          hasNew = true;
        }
      }
      if (!hasNew && cfg.didaEnabled && cfg.didaToken) {
        let tasks = await this.getInboxTasks();
        if (tasks.length > 0) {
          hasNew = true;
        }
      }
      if (hasNew) {
        this.topBarElement.innerHTML = this.getSvgHTML("outOfSync")
      }
    } catch (error) {
      console.warn("plugin-flomo-sync:checkNew失败", error);
    }
  }


  //默认数据
  async initData() {
    this.data[STORAGE_NAME] = await this.loadData(STORAGE_NAME) || {};

    let defaultConfig = {
      username: "",//用户名
      password: "",//密码
      lastSyncTime: moment().format("YYYY-MM-DD 00:00:00"),//上次同步时间
      syncSuccessTag: "",//同步成功标签
      // isAutoSync: false,//是否绑定思源的同步
      accessToken: "",//accessToken

      locationMode: "0",
      dailnoteNotebook: "",
      pageId: "",

      syncTagMode: "0",
      syncIncludeTags: "",
      syncExcludeTags: "",

      didaEnabled: false,
      didaToken: "",
      didaLastSyncTime: moment().format("YYYY-MM-DD 00:00:00"),
    }

    let d = this.data[STORAGE_NAME];
    for (let k in defaultConfig) {
      if (d[k] === undefined || d[k] === "undefined") {
        d[k] = defaultConfig[k];

        if (k === "dailnoteNotebook") {
          if (d["locationMode"] == "0") {
            //取默认数据库
            d[k] = this.siyuanStorage["local-dailynoteid"];
          }
        }
      }else if(k === "lastSyncTime" || k === "didaLastSyncTime"){
        if(!d[k]){
          d[k] = defaultConfig[k];
        }
      }
    }
  }


  async onload() {
    let conResponse = await this.getLocalStorage();
    this.siyuanStorage = conResponse["data"];
    // 加载配置数据
    await this.initData();
    const frontEnd = getFrontend();
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
    onSyncEndEvent = this.eventBusHandler.bind(this);
    // if (this.data[STORAGE_NAME].isAutoSync) {
      this.eventBus.on("sync-end", onSyncEndEvent);
    // }

    // console.log(this.siyuanStorage);
    this.topBarElement = this.addTopBar({
      icon: flomoSvg,
      title: "flomo+滴答同步",
      position: "right",
      callback: await this.runSync.bind(this),
    });

    //判断是否有新数据
    await this.checkNew()
  }

  /** 构建设置行（textarea 上下排布，其余左右排布） */
  private buildSettingRow(titleHtml: string, descHtml: string, actionEl: HTMLElement) {
    const isBlock = actionEl.tagName === "TEXTAREA";
    const row = document.createElement(actionEl.classList.contains("b3-switch") ? "label" : "div");
    if (isBlock) {
      row.className = "b3-label config__item";
      row.innerHTML = `<div class="fn__block">${titleHtml}</div>` +
        (descHtml ? `<div class="b3-label__text">${descHtml}</div>` : "");
      actionEl.classList.add("fn__block");
      row.appendChild(actionEl);
    } else {
      row.className = "fn__flex b3-label config__item";
      const left = document.createElement("div");
      left.className = "fn__flex-1";
      left.innerHTML = `<div class="fn__flex">${titleHtml}</div>` +
        (descHtml ? `<div class="b3-label__text">${descHtml}</div>` : "");
      row.appendChild(left);
      const space = document.createElement("div");
      space.className = "fn__space";
      row.appendChild(space);
      actionEl.classList.add("fn__flex-center");
      row.appendChild(actionEl);
    }
    return row;
  }

  private createTextArea(value: string, placeholder = "") {
    const el = document.createElement("textarea");
    el.className = "b3-text-field fn__block";
    el.placeholder = placeholder;
    el.value = value || "";
    return el;
  }

  private createSelect(value: string, options: { val: string, text: string }[]) {
    const el = document.createElement("select");
    el.className = "b3-select fn__flex-center fn__size200";
    for (const option of options) {
      const optionElement = document.createElement("option");
      optionElement.value = option.val;
      optionElement.text = option.text;
      el.appendChild(optionElement);
    }
    el.value = value;
    return el;
  }

  /** 自定义双 Tab 设置：flomo / 滴答 */
  openSetting() {
    const d = this.data[STORAGE_NAME] || {};
    const today = moment().format("YYYY-MM-DD 00:00:00");

    const usernameElement = this.createTextArea(d.username, "手机或邮箱");
    const passwordElement = this.createTextArea(d.password, "请输入密码");
    const lastSyncTimeElement = this.createTextArea(d.lastSyncTime, "如有特殊要求可指定上次同步时间");
    const syncSuccessTagElement = this.createTextArea(d.syncSuccessTag, "请输入回写同步成功标签，如：“已同步”");
    const accessTokenElement = this.createTextArea(d.accessToken, "");
    const dailnoteNotebookElement = this.createTextArea(d.dailnoteNotebook, "请输入 dailynote 笔记本 id");
    const pageIdElement = this.createTextArea(d.pageId, "请输入文档 id");
    const syncIncludeTagsElement = this.createTextArea(d.syncIncludeTags, "如：“工作 收集箱”");
    const syncExcludeTagsElement = this.createTextArea(d.syncExcludeTags, "如：“草稿 已同步”");
    const locationModeElement = this.createSelect(d.locationMode || "0", [
      { val: "0", text: "指定笔记本 daily note 中" },
      { val: "1", text: "指定文档中" },
    ]);
    const syncTagModeElement = this.createSelect(d.syncTagMode || "0", [
      { val: "0", text: "排除标签" },
      { val: "1", text: "包含标签" },
    ]);

    const didaEnabledElement = document.createElement("input");
    didaEnabledElement.type = "checkbox";
    didaEnabledElement.className = "b3-switch fn__flex-center";
    didaEnabledElement.checked = !!d.didaEnabled;
    const didaTokenElement = this.createTextArea(d.didaToken || "", "请粘贴滴答清单个人 API Token");
    const didaLastSyncTimeElement = this.createTextArea(d.didaLastSyncTime || "", "如：2000-01-01 00:00:00");

    const dialog = new Dialog({
      title: "flomo+滴答 同步设置",
      width: this.isMobile ? "92vw" : "720px",
      height: "80vh",
      content: `
        <div class="b3-dialog__content flomo-dida-setting">
          <div class="flomo-dida-setting__tabs fn__flex">
            <button type="button" class="b3-button b3-button--outline" data-tab="flomo">flomo</button>
            <div class="fn__space"></div>
            <button type="button" class="b3-button b3-button--outline" data-tab="dida">滴答</button>
          </div>
          <div class="flomo-dida-setting__panel" data-panel="flomo"></div>
          <div class="flomo-dida-setting__panel" data-panel="dida" style="display:none"></div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel">${(window as any).siyuan?.languages?.cancel || "取消"}</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text" data-type="confirm">${(window as any).siyuan?.languages?.save || "保存"}</button>
        </div>
      `,
    });

    const contentEl = dialog.element.querySelector(".flomo-dida-setting") as HTMLElement;
    const flomoPanel = contentEl.querySelector('[data-panel="flomo"]') as HTMLElement;
    const didaPanel = contentEl.querySelector('[data-panel="dida"]') as HTMLElement;
    const tabButtons = Array.from(contentEl.querySelectorAll("[data-tab]")) as HTMLButtonElement[];

    const switchTab = (name: string) => {
      flomoPanel.style.display = name === "flomo" ? "" : "none";
      didaPanel.style.display = name === "dida" ? "" : "none";
      tabButtons.forEach((btn) => {
        const active = btn.getAttribute("data-tab") === name;
        btn.classList.toggle("b3-button--text", active);
        btn.classList.toggle("b3-button--outline", !active);
      });
    };
    tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab"))));
    switchTab("flomo");

    flomoPanel.appendChild(this.buildSettingRow("账号<code class='fn__code'>必填项</code>", "请输入 flomo 的手机号或邮箱", usernameElement));
    flomoPanel.appendChild(this.buildSettingRow("密码<code class='fn__code'>必填项</code>", "", passwordElement));
    flomoPanel.appendChild(this.buildSettingRow("上次同步时间", `为空则默认为今天0点，${today}，并会自动记录本次同步时间`, lastSyncTimeElement));
    flomoPanel.appendChild(this.buildSettingRow("写入思源位置方案", "flomo 与滴答共用此目标：daily note 或指定文档", locationModeElement));
    flomoPanel.appendChild(this.buildSettingRow("dailynote笔记本id", "右击文档树笔记本 → 打开文件位置，路径 id 即是", dailnoteNotebookElement));
    flomoPanel.appendChild(this.buildSettingRow("指定文档id", "写入位置方案选「指定文档」时填写", pageIdElement));
    flomoPanel.appendChild(this.buildSettingRow("同步标签方案", "排除标签（默认）或包含标签", syncTagModeElement));
    flomoPanel.appendChild(this.buildSettingRow("同步包含标签", "与排除标签互斥；空格分隔；不要加 #", syncIncludeTagsElement));
    flomoPanel.appendChild(this.buildSettingRow("同步排除标签", "与包含标签互斥；空格分隔；不要加 #", syncExcludeTagsElement));
    flomoPanel.appendChild(this.buildSettingRow("回写同步成功标签", "为空则不加。不要加 #；回写后不能批量去掉，请谨慎填写", syncSuccessTagElement));
    flomoPanel.appendChild(this.buildSettingRow("accessToken", "一般不填；登录异常时可手动更改", accessTokenElement));

    didaPanel.appendChild(this.buildSettingRow("启用滴答同步", "开启后与 flomo 一并同步收集箱；写入成功后删除原任务", didaEnabledElement));
    didaPanel.appendChild(this.buildSettingRow("滴答 API Token", "dida365.com → 头像 → 设置 → 账号 → API Token。请勿分享含 Token 的备份", didaTokenElement));
    didaPanel.appendChild(this.buildSettingRow("滴答上次同步时间", "有时间戳的任务会跳过更早条目；可改成 2000-01-01 00:00:00 同步旧任务", didaLastSyncTimeElement));
    const sharedTip = document.createElement("div");
    sharedTip.className = "b3-label__text";
    sharedTip.style.padding = "8px 0";
    sharedTip.textContent = "写入思源位置与 flomo 共用，请在「flomo」Tab 中配置。";
    didaPanel.appendChild(sharedTip);

    const btns = dialog.element.querySelectorAll(".b3-dialog__action .b3-button");
    btns[0].addEventListener("click", () => dialog.destroy());
    btns[1].addEventListener("click", async () => {
      const cfg = this.data[STORAGE_NAME];
      if (!pageIdElement.value && locationModeElement.value == "1") {
        this.pushErrMsg("同步到指定文档需要配置文档id");
      }
      if (syncSuccessTagElement.value.length != 0) {
        if (syncSuccessTagElement.value.includes(" ")) {
          this.pushErrMsg("同步成功标签不能包含空格，也不能有多个，请重新配置");
        }
        if (cfg.syncSuccessTag === "") {
          let isAgree = await this.waitFunction(
            confirm, () => true, () => false,
            `温馨提示`,
            `将同步成功的标签${syncSuccessTagElement.value}回写进flomo后该插件不能撤销，是否同意写入？`
          );
          if (!isAgree) {
            syncSuccessTagElement.value = "";
          }
        }
      }
      if (didaEnabledElement.checked && !didaTokenElement.value.trim()) {
        this.pushErrMsg("启用滴答同步时需要填写 API Token");
      }

      cfg.username = usernameElement.value;
      cfg.password = passwordElement.value;
      cfg.lastSyncTime = lastSyncTimeElement.value;
      cfg.syncSuccessTag = syncSuccessTagElement.value;
      cfg.accessToken = accessTokenElement.value;
      cfg.locationMode = locationModeElement.value;
      cfg.dailnoteNotebook = dailnoteNotebookElement.value;
      cfg.pageId = pageIdElement.value;
      cfg.syncTagMode = syncTagModeElement.value;
      cfg.syncIncludeTags = syncIncludeTagsElement.value;
      cfg.syncExcludeTags = syncExcludeTagsElement.value;
      cfg.didaEnabled = didaEnabledElement.checked;
      cfg.didaToken = didaTokenElement.value.trim();
      cfg.didaLastSyncTime = didaLastSyncTimeElement.value;
      await this.saveData(STORAGE_NAME, cfg);
      dialog.destroy();
    });
  }

  async onunload() {
    this.eventBus.off("sync-end", this.eventBusHandler.bind(this));
    this.syncing = false;
  }

  async onLayoutReady() {
    // console.log("onLayoutReady");
    if (!this.data[STORAGE_NAME].accessToken) {
      await this.connect();
    }
  }

  // 连接flomo
  async connect() {
    let config = this.data[STORAGE_NAME];
    if (!config.username || !config.password) {
      await this.pushErrMsg("plugin-flomo-sync:" + "用户名或密码为空，重新配置后再试")
    }
    let timestamp = Math.floor(Date.now() / 1000).toFixed();
    // let sign = this.createSign(config.username, config.password, timestamp);
    let url = "https://flomoapp.com/api/v1/user/login_by_email"
    let data = {
      "api_key": "flomo_web",
      "app_version": "2.0",
      "email": config.username,
      "password": config.password,
      // "sign": sign,
      "timestamp": timestamp,
      "webp": "1",
    }
    data["sign"] = this.createSign2(data);
    try {
      let response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.data[STORAGE_NAME]["accessToken"]}`,
          'Content-Type': 'application/json',
          'User-Agent': USG
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const resData = await response.json();
      // console.log(resData);
      if (resData.code == -10) {
        throw new Error(`同步失败，请重试：${resData.message}`);
      } else if (resData.code == -1) {
        throw new Error(`请检查用户名和密码，或手动更新accessToken后再试`);
      } else if (resData.code !== 0) {
        throw new Error(`Server error! msg: ${resData.message}`);
      } else {
        // 登录成功 ，刷新AccessToken
        this.data[STORAGE_NAME]["accessToken"] = resData.data["access_token"];
        await this.saveData(STORAGE_NAME, this.data[STORAGE_NAME]);
      }
      return true;
    } catch (error) {
      await this.pushErrMsg("plugin-flomo-sync:" + error);
      return false;
    }
  }


  // createSign(username, password, timestamp) {
  //   let words = `api_key=flomo_web&app_version=2.0&email=${username}&password=${password}&timestamp=${timestamp}&webp=1dbbc3dd73364b4084c3a69346e0ce2b2`
  //   let sign = new Md5().appendStr(words).end();
  //   // console.log(sign);
  //   return sign;
  // }

  createSign2(param){
    //from flomo web
    const SECRET = 'dbbc3dd73364b4084c3a69346e0ce2b2'
    const sortParam = {};
    Object.keys(param).sort().forEach(function(key) {
      sortParam[key] = param[key];
    });

    let paramString = ''
    for (let key in sortParam) {
      let value = sortParam[key]
      if (typeof value === 'undefined' || (!value && value !== 0)) continue

      if (Array.isArray(value)) {
        value.sort(function (a, b) {
          return a && b ? a.toString().localeCompare(b.toString()) : 0
        })

        for (let index in value) {
          let v = value[index]
          paramString += key + '[]=' + v + '&'
        }
      } else {
        paramString += key + '=' + value + '&'
      }
    }
    paramString = paramString.substring(0, paramString.length - 1)
    let sign = new Md5().appendStr(paramString + SECRET).end();
    return sign
  }

  async check_authorization_and_reconnect(resData) {
    // 检测到accessToken失效就提示，就重新登录
    if (resData.code == -10) {
      // 重新登录
      await this.connect();
      await this.pushErrMsg(`正重新登录，请重新再试`);
      return false;
    } else if (resData.code !== 0) {
      await this.pushErrMsg(`Server error! msg: ${resData.message}`);
      // throw new Error(`Server error! msg: ${resData.message}`);
    }
    return resData.code == 0;
  }
}