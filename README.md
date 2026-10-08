# statusline-band

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that draws a status line above the prompt, in the terminal and in the Desktop app's Code tab.

```
Opus 5.5  |  myproject@main (+13 -3)  |  84k/200k (42%)  |  5h 37%
```

[中文说明](#中文说明)

## What it shows

| Segment | Meaning |
| :- | :- |
| `Opus 5.5` | The session's model, as `/model` shows it |
| `myproject@main` | The session directory's name and its git branch; the branch is left out outside a repository |
| `(+13 -3)` | Lines added and deleted in unstaged changes; left out when the tree is clean |
| `84k/200k (42%)` | Context tokens used, the model's window, and the percentage |
| `5h 37%` | How much of the 5-hour limit is used; `5h --` until the session's first response |

The colors are Solarized's accents, which read on a light and on a dark background. Both percentages turn orange at 70% and red at 90%.

The line is drawn again after each model response and whenever Claude Code measures the session. Git is read in the background, one read at a time, so a slow repository never holds a turn or the session's start.

## Requirements

- Claude Code v2.1.287 or later in the terminal, or v2.1.286 or later in the Desktop app's Code tab
- `git` on your `PATH`, for the branch and the line counts

The mod draws in the terminal and in the Desktop app. Its hooks run elsewhere (the VS Code extension's chat panel, `claude -p`), but nothing is drawn there.

## Install

In a Claude Code session in your terminal:

```
/plugin install statusline-band --marketplace waylongo/statusline-band
```

Or from your shell:

```bash
claude plugin marketplace add waylongo/statusline-band
claude plugin install statusline-band@statusline-band
```

Installed at the user scope from a terminal, it loads in the Desktop app's local sessions too. Sessions that are already open pick it up after `/reload-plugins` or a restart.

## What it does on your machine

A mod is code that runs with your permissions, so here is all this one does:

- Runs `git rev-parse --abbrev-ref HEAD` and `git diff --numstat` in the session's directory. Both only read.
- Reads the session's model, working directory and usage figures from Claude Code.
- Makes no network requests and writes no files.

You can check that before installing. Clone the repository and run:

```bash
claude plugin validate ./statusline-band
```

The `hooks:` and `calls:` lines list every event the mod handles and everything it asks Claude Code to do.

## Known limitations

- Without a subscription (an API key, Bedrock, Vertex) there is no 5-hour reading, so the last segment stays `5h --`.
- On Windows the directory segment shows the whole path instead of the directory's name.
- In a narrow window the line wraps onto a second row.
- The line counts cover unstaged changes only; they drop to zero after `git add`.
- On a detached HEAD the branch reads `HEAD`.

Checked by hand in the macOS Desktop app. The terminal is covered by the test suite only.

## Customize

Everything is in [hooks/register.tsx](hooks/register.tsx), about 150 lines. The colors are the constants at the top, and `colorFor` holds the 70% and 90% thresholds.

## Develop

```bash
claude --plugin-dir .      # load from this folder; saving a file reloads the mod
claude plugin validate .   # what the engine would refuse, before a session loads it
claude plugin test .       # run tests/*.test.tsx against the engine
```

Claude Code writes its type declarations to `.claude-plugin/types/` each time it loads the mod from this folder, which is what `tsconfig.json` extends.

## License

[MIT](LICENSE)

## 中文说明

一个 Claude Code mod：在输入框上方画一条状态栏，终端和桌面端 Code 标签页都能显示。

从左到右依次是：模型名、目录名@git 分支、未暂存改动的增删行数、上下文已用/窗口大小（百分比）、5 小时限额已用百分比。新会话在第一次回复之前没有限额读数，显示 `5h --`。两个百分比到 70% 变橙色，到 90% 变红色。

安装（在终端的 Claude Code 会话里输入）：

```
/plugin install statusline-band --marketplace waylongo/statusline-band
```

需要 Claude Code v2.1.287 以上（桌面端 v2.1.286 以上）。它只运行两条只读的 git 命令，不联网、不写文件。已知限制见上面的 Known limitations。
