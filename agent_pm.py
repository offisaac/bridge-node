#!/usr/bin/env python3
"""
Agent-PM: 持续决策循环
- 每 30 秒检查一次提案列表
- 评估提案优先级
- 直接执行修复
- 重启服务器使修改生效
- 记录变更到 bug_tracking_matrix.csv
- 永远不停止
"""

import os
import sys
import time
import json
import csv
import subprocess
import signal
import requests
from datetime import datetime

# Force unbuffered output
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)

API_BASE = "http://127.0.0.1:8888"
UNRESOLVED_ISSUES_FILE = "/home/pengxiang/bridge-node/unresolved_issues.csv"
BUG_TRACKING_FILE = "/home/pengxiang/bridge-node/bug_tracking_matrix.csv"
SERVER_SCRIPT = "/home/pengxiang/bridge-node/server.py"
SERVER_PORT = 8888

class AgentPM:
    def __init__(self):
        self.start_time = time.time()
        self.iteration = 0
        self.server_pid = self.find_server_pid()
        print(f"[Agent-PM] Initialized at {datetime.now()}")
        print(f"[Agent-PM] Server PID: {self.server_pid}")

    def find_server_pid(self):
        """Find the running server process PID"""
        try:
            result = subprocess.run(
                ["pgrep", "-f", "python.*server.py"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                pids = result.stdout.strip().split('\n')
                if pids:
                    return int(pids[0])
        except Exception as e:
            print(f"[Agent-PM] Error finding server: {e}")
        return None

    def push(self, content, label="Agent-PM"):
        """Push to frontend"""
        try:
            resp = requests.post(f"{API_BASE}/api/claude/push",
                              json={"content": content, "label": label},
                              timeout=5)
            return resp.status_code == 200
        except Exception:
            pass
            return False

    def read_unresolved_issues(self):
        """读取未解决的提案列表"""
        issues = []
        try:
            with open(UNRESOLVED_ISSUES_FILE, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get('status') == 'open':
                        issues.append(row)
        except Exception as e:
            print(f"[Agent-PM] Error reading issues: {e}")
        return issues

    def prioritize_issues(self, issues):
        """根据严重程度对提案进行优先级排序"""
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        return sorted(issues, key=lambda x: severity_order.get(x.get('severity', 'low'), 3))

    def evaluate_proposal(self, issue):
        """评估提案并决定是否执行"""
        severity = issue.get('severity', 'medium')
        issue_id = issue.get('issue_id', 'unknown')

        # 根据严重程度和影响范围评估
        priority_score = {
            'critical': 10,
            'high': 7,
            'medium': 4,
            'low': 1
        }.get(severity, 1)

        return priority_score >= 4  # 只处理 medium 及以上

    def fix_issue(self, issue):
        """执行修复 - 这里应该根据 issue 类型调用相应的修复函数"""
        issue_id = issue.get('issue_id', '')
        description = issue.get('description', '')

        print(f"[Agent-PM] Attempting to fix: {issue_id} - {description[:50]}...")

        # 这里可以根据 issue_id 的前缀来调用不同的修复逻辑
        # 例如 SEC 开头的调用安全修复模块
        # 目前先记录需要人工处理的 issue

        return False  # 返回 False 表示无法自动修复，需要人工介入

    def restart_server(self):
        """重启服务器"""
        print(f"[Agent-PM] Restarting server...")

        # 找到并终止现有服务器进程
        if self.server_pid:
            try:
                os.kill(self.server_pid, signal.SIGTERM)
                print(f"[Agent-PM] Sent SIGTERM to PID {self.server_pid}")
                time.sleep(2)
            except ProcessLookupError:
                print(f"[Agent-PM] Process {self.server_pid} not found")
            except Exception as e:
                print(f"[Agent-PM] Error killing process: {e}")

        # 启动新服务器
        try:
            subprocess.Popen(
                ["python", SERVER_SCRIPT, "--port", str(SERVER_PORT)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=os.path.dirname(SERVER_SCRIPT)
            )
            print(f"[Agent-PM] Server started on port {SERVER_PORT}")
            time.sleep(3)  # 等待服务器启动
            self.server_pid = self.find_server_pid()
            return True
        except Exception as e:
            print(f"[Agent-PM] Error starting server: {e}")
            return False

    def record_fix(self, issue, success, fix_strategy=""):
        """记录修复到 bug_tracking_matrix.csv"""
        try:
            # 读取现有内容
            existing_rows = []
            try:
                with open(BUG_TRACKING_FILE, 'r') as f:
                    reader = csv.DictReader(f)
                    existing_rows = list(reader)
            except Exception:
                pass
                pass

            # 添加新记录
            new_row = {
                'issue_id': issue.get('issue_id', ''),
                'description': issue.get('description', ''),
                'severity': issue.get('severity', 'medium'),
                'status': 'fixed' if success else 'failed',
                'created_date': issue.get('created_date', datetime.now().strftime('%Y-%m-%d')),
                'git_hash': 'TBD',
                'fix_strategy': fix_strategy if fix_strategy else 'Auto-fix attempted'
            }

            # 检查是否已存在
            exists = any(row.get('issue_id') == new_row['issue_id'] for row in existing_rows)

            if not exists:
                existing_rows.append(new_row)

                # 写回文件
                with open(BUG_TRACKING_FILE, 'w', newline='') as f:
                    fieldnames = ['issue_id', 'description', 'severity', 'status', 'created_date', 'git_hash', 'fix_strategy']
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(existing_rows)

                print(f"[Agent-PM] Recorded fix for {new_row['issue_id']}")
                return True
        except Exception as e:
            print(f"[Agent-PM] Error recording fix: {e}")
        return False

    def update_issue_status(self, issue_id, status):
        """更新 unresolved_issues.csv 中的状态"""
        try:
            rows = []
            with open(UNRESOLVED_ISSUES_FILE, 'r') as f:
                reader = csv.DictReader(f)
                rows = list(reader)

            for row in rows:
                if row.get('issue_id') == issue_id:
                    row['status'] = status
                    row['resolved_date'] = datetime.now().strftime('%Y-%m-%d') if status == 'fixed' else ''

            with open(UNRESOLVED_ISSUES_FILE, 'w', newline='') as f:
                fieldnames = ['issue_id', 'description', 'severity', 'status', 'created_date', 'resolved_date']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)

            return True
        except Exception as e:
            print(f"[Agent-PM] Error updating issue status: {e}")
            return False

    def run_cycle(self):
        """执行一个决策循环"""
        self.iteration += 1
        print(f"\n=== Agent-PM Cycle {self.iteration} ===")

        # 1. 读取提案列表
        issues = self.read_unresolved_issues()
        print(f"[Agent-PM] Found {len(issues)} open issues")

        if not issues:
            self.push("No pending proposals", "PM")
            return

        # 2. 优先级排序
        prioritized = self.prioritize_issues(issues)
        print(f"[Agent-PM] Prioritized: {prioritized[0].get('issue_id') if prioritized else 'none'}")

        # 3. 评估并处理最高优先级提案
        processed = False
        for issue in prioritized:
            if self.evaluate_proposal(issue):
                print(f"[Agent-PM] Processing: {issue.get('issue_id')}")

                # 尝试修复
                success = self.fix_issue(issue)

                # 记录修复结果
                fix_strategy = "Auto-fix applied" if success else "Requires manual intervention"
                self.record_fix(issue, success, fix_strategy)

                # 更新状态
                if success:
                    self.update_issue_status(issue.get('issue_id'), 'fixed')
                    self.push(f"Fixed: {issue.get('issue_id')}", "PM")
                else:
                    self.push(f"Manual fix needed: {issue.get('issue_id')}", "PM")

                processed = True
                break

        if not processed:
            self.push("All issues require manual intervention", "PM")

    def run(self):
        """运行无限循环"""
        print("[Agent-PM] Starting infinite decision loop...")
        self.push("Agent-PM started - monitoring proposals", "PM")

        while True:
            try:
                self.run_cycle()

                # 等待 30 秒
                for i in range(30, 0, -5):
                    if i % 10 == 0 or i <= 5:
                        print(f"[Agent-PM] Next cycle in {i}s...")
                    time.sleep(5)

            except KeyboardInterrupt:
                print("[Agent-PM] Stopped by user")
                break
            except Exception as e:
                print(f"[Agent-PM Error] {e}")
                time.sleep(5)

if __name__ == "__main__":
    pm = AgentPM()
    pm.run()
