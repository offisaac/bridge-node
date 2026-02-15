# BridgeNode Debug 学习经验

## 问题 1: Changelog 弹窗闪烁

### 症状
- 页面加载时 Changelog 弹窗短暂闪现然后消失

### 根因分析
1. `filePreviewModal` 同时有 `class="hidden"` 和 `style="display: flex"` 内联样式
2. CSS 的 `display: flex` 优先级高于 `display: none`
3. 导致页面加载时弹窗显示，然后被 JS 隐藏

### 解决方案
```html
<!-- 错误写法 -->
<div id="filePreviewModal" class="hidden" style="display: flex; ...">

<!-- 正确写法 -->
<div id="filePreviewModal" class="hidden" style="...">
<!-- 移除 display: flex，只用 class="hidden" 控制显示 -->
```

### 关键学习点
- **CSS 优先级**: 内联样式 > 类样式
- **调试技巧**: 检查元素同时有 `display: none` 和 `display: flex` 的冲突

---

## 问题 2: Changelog 无内容

### 症状
- 点击 Changelog 按钮后弹窗显示但没有内容

### 根因分析
- 存在两个 `showChangelog` 函数定义
- 第一个函数（行号较小）没有设置内容
- JavaScript 执行时第一个函数覆盖了第二个

### 解决方案
1. 删除重复函数定义
2. 确保只保留一个 `showChangelog` 函数

### 关键学习点
- **函数重复定义**: 后定义的函数会覆盖前面的
- **调试技巧**: 使用 `grep` 搜索重复的函数名

---

## 问题 3: 双层弹窗

### 症状
- 关闭 Changelog 后又出现一个 File Preview 弹窗

### 根因分析
- 代码中同时存在 `filePreviewModal` 和 `changelogModal` 两个弹窗
- 点击关闭时调用了错误的关闭函数

### 解决方案
1. 移除独立的 `changelogModal`
2. 复用 `filePreviewModal` 显示 Changelog

### 关键学习点
- **UI 一致性**: 避免创建重复的 UI 组件
- **调试技巧**: 检查是否有多个相似的 modal 元素

---

## 问题 4: localStorage 时序问题

### 症状
- Changelog 在不应该显示时也显示了

### 根因分析
- `localStorage.setItem` 在 `showChangelog()` 之后执行
- 如果用户快速关闭弹窗，下次刷新还会显示

### 解决方案
```javascript
// 错误
if (!localStorage.getItem('changelogShown')) {
    showChangelog();
    localStorage.setItem('changelogShown', 'true');  // 显示后才设置
}

// 正确
if (!localStorage.getItem('changelogShown')) {
    localStorage.setItem('changelogShown', 'true');  // 先设置标志
    setTimeout(() => showChangelog(), 300);
}
```

### 关键学习点
- **状态标志**: 设置标志要早于触发行为
- **用户体验**: 避免用户操作导致状态不一致

---

## Debug 快速定位清单

1. **CSS 冲突**: 检查是否有重复的 `display` 属性
2. **函数重复**: `grep` 搜索重复的函数/变量名
3. **UI 组件**: 确认没有多个相似的 modal/popup
4. **时序问题**: 检查 localStorage/状态设置的顺序
5. **浏览器缓存**: 修改后记得重启服务器/清除缓存

---

## 快速 Debug 命令

```bash
# 搜索重复的函数定义
grep -n "function showChangelog" index.html

# 检查元素属性
grep 'id=".*Modal"' index.html

# 查看 localStorage
# 浏览器控制台: localStorage.getItem('changelogShown')
# 清除: localStorage.removeItem('changelogShown')
```
