---
schema: 1
last_reviewed: 2026-05-16
openclaw_ref: v2026.5.12
---

# OpenClaw Capability Inventory

Status key: `done` | `partial` | `gap` | `oos` (out-of-scope for mobile)

Stable `id`s are the dedup key for the drift watcher — **never rename them**.

OOS discipline: only clearly server-internal surfaces use `oos`: deployment targets,
plugin SDK internals, channel-bridge mechanics for channels mobile doesn't run, and
gateway-admin-only TUI config. User-facing capabilities default to `gap` pending a
deliberate "no" decision (add reason in `notes`).

## Sessions
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| sessions.list | List sessions | `sessions.list` | done | src/lib/openclaw/sessions.ts | |
| sessions.get | Get session | `sessions.get` | done | src/lib/openclaw/sessions.ts | |
| sessions.delete | Delete session | `sessions.delete` | done | src/lib/openclaw/sessions.ts | |
| sessions.patch | Update session metadata | `sessions.patch` | done | src/lib/openclaw/sessions.ts | |
| sessions.compact | Compact session context | `sessions.compact` | done | src/lib/openclaw/sessions.ts | |
| sessions.spawn | Spawn new session | `sessions.spawn` | done | src/lib/openclaw/sessions.ts | |
| sessions.reset | Reset session | `sessions.reset` | done | src/lib/openclaw/client.ts | |
| sessions.usage | Per-session token usage | `sessions.usage` | done | src/lib/openclaw/features.ts | |
| sessions.usage.timeseries | Session usage timeseries | `sessions.usage.timeseries` | gap | — | detailed analytics view |
| sessions.usage.logs | Session usage log entries | `sessions.usage.logs` | gap | — | detailed analytics view |
| sessions.subscribe | Subscribe to session change events | `sessions.subscribe` | gap | — | live session event streaming |
| sessions.unsubscribe | Unsubscribe from session change events | `sessions.unsubscribe` | gap | — | live session event streaming |
| sessions.messages.subscribe | Subscribe to session message events | `sessions.messages.subscribe` | done | src/lib/openclaw/chat.ts, src/hooks/useChat.ts | no cursor/replay — pure push; subscribe on connect, reconcile via chat.history on reconnect |
| sessions.messages.unsubscribe | Unsubscribe from session message events | `sessions.messages.unsubscribe` | done | src/lib/openclaw/chat.ts, src/hooks/useChat.ts | unsubscribe on session change or disconnect |
| sessions.preview | Bounded transcript preview | `sessions.preview` | gap | — | session list preview |
| sessions.describe | Session row by exact key | `sessions.describe` | gap | — | direct session lookup |
| sessions.resolve | Canonicalize session target | `sessions.resolve` | gap | — | session target resolution |
| sessions.create | Create session entry | `sessions.create` | gap | — | explicit session creation |
| sessions.send | Send message into session | `sessions.send` | gap | — | alternative send path to chat.send |
| sessions.steer | Interrupt-and-steer active session | `sessions.steer` | done | src/lib/openclaw/chat.ts, src/hooks/useChat.ts | atomically aborts active run then sends new content; used by retry path |
| sessions.abort | Abort active session work | `sessions.abort` | done | src/lib/openclaw/chat.ts, src/lib/openclaw/client.ts | delegates to chat.abort; used before retry when steer not applicable |
| models.list | Runtime model catalog | `models.list` | done | src/lib/openclaw/client.ts | |
| commands.list | Agent command inventory | `commands.list` | done | src/lib/openclaw/commands.ts | |

## Chat
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| chat.history | Session message history | `chat.history` | done | src/lib/openclaw/chat.ts | |
| chat.send | Send chat message | `chat.send` | done | src/lib/openclaw/chat.ts | |
| chat.abort | Abort in-flight chat | `chat.abort` | done | src/lib/openclaw/chat.ts | |
| chat.inject | Inject chat event (server-side) | `chat.inject` | gap | — | transcript-only chat event injection |
| send | Direct outbound delivery | `send` | gap | — | channel/account/thread-targeted send outside chat runner |

## Agents
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| agents.list | List agents | `agents.list` | done | src/lib/openclaw/agents.ts | |
| agents.create | Create agent | `agents.create` | done | src/lib/openclaw/agents.ts | |
| agents.update | Update agent | `agents.update` | gap | — | agent edit UI pending |
| agents.delete | Delete agent | `agents.delete` | done | src/lib/openclaw/agents.ts | |
| agents.files.list | List agent workspace files | `agents.files.list` | done | src/lib/openclaw/agents.ts | |
| agents.files.get | Get agent workspace file | `agents.files.get` | done | src/lib/openclaw/agents.ts | |
| agents.files.set | Write agent workspace file | `agents.files.set` | done | src/lib/openclaw/agents.ts | |
| agent.identity.get | Agent identity | `agent.identity.get` | done | src/lib/openclaw/agents.ts | |
| agent.wait | Wait for run completion | `agent.wait` | gap | — | needed for long-running task polling |
| tasks.list | List gateway tasks | `tasks.list` | gap | — | task ledger UI |
| tasks.get | Get task details | `tasks.get` | gap | — | task ledger UI |
| tasks.cancel | Cancel task | `tasks.cancel` | gap | — | task ledger UI |
| artifacts.list | List session artifacts | `artifacts.list` | gap | — | media/artifact browser |
| artifacts.get | Get artifact metadata | `artifacts.get` | gap | — | media/artifact browser |
| artifacts.download | Download artifact | `artifacts.download` | gap | — | media/artifact browser |
| environments.list | List environments | `environments.list` | gap | — | node environment discovery |
| environments.status | Environment status | `environments.status` | gap | — | node environment discovery |

## Skills
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| skills.status | Skill inventory | `skills.status` | done | src/lib/openclaw/skills.ts | |
| skills.install | Install skill | `skills.install` | done | src/lib/openclaw/skills.ts | |
| skills.update | Update skill | `skills.update` | done | src/lib/openclaw/skills.ts | |
| skills.search | ClawHub skill search | `skills.search` | gap | — | ClawHub discovery UI |
| skills.detail | ClawHub skill detail | `skills.detail` | gap | — | ClawHub discovery UI |
| skills.bins | Skill executables list (node-side) | `skills.bins` | oos | — | node-side auto-allow check; not operator-initiated |
| skills.upload.begin | Begin skill archive upload | `skills.upload.begin` | oos | — | admin upload path; disabled by default |
| skills.upload.chunk | Chunk skill archive upload | `skills.upload.chunk` | oos | — | admin upload path |
| skills.upload.commit | Commit skill archive upload | `skills.upload.commit` | oos | — | admin upload path |

## Cron
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| cron.list | List cron jobs | `cron.list` | done | src/lib/openclaw/cron-jobs.ts | |
| cron.get | Get cron job details | `cron.get` | done | src/lib/openclaw/cron-jobs.ts | |
| cron.add | Add cron job | `cron.add` | done | src/lib/openclaw/cron-jobs.ts | |
| cron.update | Update cron job | `cron.update` | done | src/lib/openclaw/cron-jobs.ts | |
| cron.remove | Remove cron job | `cron.remove` | done | src/lib/openclaw/cron-jobs.ts | |
| cron.run | Run cron job immediately | `cron.run` | done | src/lib/openclaw/cron-jobs.ts | |
| cron.runs | Cron run history / follow a run | `cron.runs` | gap | — | follow queued manual run by runId |
| wake | Schedule immediate wake injection | `wake` | gap | — | heartbeat wake text injection for automation |

## Config
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| config.get | Get config snapshot | `config.get` | done | src/lib/openclaw/config.ts | |
| config.patch | Patch config | `config.patch` | done | src/lib/openclaw/config.ts | |
| config.set | Write full config | `config.set` | gap | — | full config write; patch covers current needs |
| config.apply | Validate + replace config | `config.apply` | gap | — | admin-level config replacement |
| config.schema | Live config schema | `config.schema` | gap | — | config editor UI |
| config.schema.lookup | Path-scoped schema lookup | `config.schema.lookup` | gap | — | config editor drill-down |
| secrets.reload | Re-resolve active secrets | `secrets.reload` | gap | — | secrets management UI |
| secrets.resolve | Resolve secret assignments | `secrets.resolve` | gap | — | secrets management UI |
| update.run | Run gateway update | `update.run` | gap | — | update flow; low priority on mobile |
| update.status | Update status | `update.status` | gap | — | update flow |
| wizard.start | Onboarding wizard start | `wizard.start` | gap | — | first-run wizard |
| wizard.next | Onboarding wizard next step | `wizard.next` | gap | — | first-run wizard |
| wizard.status | Onboarding wizard status | `wizard.status` | gap | — | first-run wizard |
| wizard.cancel | Onboarding wizard cancel | `wizard.cancel` | gap | — | first-run wizard |
| health | Gateway health snapshot | `health` | gap | — | connection status indicator |
| status | Gateway summary | `status` | gap | — | admin status page |
| gateway.identity.get | Gateway device identity | `gateway.identity.get` | gap | — | pairing/relay flows |
| system-presence | Presence snapshot | `system-presence` | gap | — | presence UI |
| system-event | Append system event | `system-event` | oos | — | server-side event injection |
| last-heartbeat | Last heartbeat event | `last-heartbeat` | gap | — | heartbeat monitor |
| set-heartbeats | Toggle heartbeat processing | `set-heartbeats` | oos | — | server admin only |

## Hooks
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| hooks.list | List hooks (via config) | `config.get` | partial | src/lib/openclaw/hooks.ts | hooks read via config snapshot; no dedicated RPC |
| hooks.toggle | Toggle hook enabled | `config.patch` | partial | src/lib/openclaw/hooks.ts | written via config patch |
| hooks.env | Update hook env | `config.patch` | partial | src/lib/openclaw/hooks.ts | written via config patch |

## Nodes
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| node.list | List paired nodes | `node.list` | done | src/lib/openclaw/nodes.ts | |
| node.describe | Get node state | `node.describe` | gap | — | node detail view |
| node.rename | Rename paired node | `node.rename` | gap | — | node label management |
| node.invoke | Invoke node command | `node.invoke` | gap | — | delegate work to connected node |
| node.invoke.result | Get node invoke result | `node.invoke.result` | gap | — | node invoke completion |
| node.event | Node event push (node-side) | `node.event` | oos | — | node-side event push; not operator-initiated |
| node.pending.pull | Pull pending node work (node-side) | `node.pending.pull` | oos | — | node queue API; node-side only |
| node.pending.ack | Acknowledge pending work (node-side) | `node.pending.ack` | oos | — | node queue API; node-side only |
| node.pending.enqueue | Enqueue work for offline node | `node.pending.enqueue` | gap | — | durable work queue for offline nodes |
| node.pending.drain | Drain offline node work queue | `node.pending.drain` | gap | — | drain durable node work |
| node.canvas.capability.refresh | Refresh canvas capabilities | `node.canvas.capability.refresh` | done | src/lib/openclaw/canvas.ts | |
| node.pair.request | Request node pair (node-initiated) | `node.pair.request` | oos | — | node-initiated pairing; operator receives event |
| node.pair.list | List node pair requests | `node.pair.list` | gap | — | node pairing management UI |
| node.pair.approve | Approve node pair | `node.pair.approve` | gap | — | node pairing management UI |
| node.pair.reject | Reject node pair | `node.pair.reject` | gap | — | node pairing management UI |
| node.pair.remove | Remove node pair | `node.pair.remove` | gap | — | node pairing management UI |
| node.pair.verify | Verify node pair bootstrap | `node.pair.verify` | gap | — | bootstrap verification |
| device.pair.list | List paired devices | `device.pair.list` | done | src/lib/openclaw/nodes.ts | |
| device.pair.approve | Approve device pair request | `device.pair.approve` | done | src/lib/openclaw/nodes.ts | |
| device.pair.reject | Reject device pair request | `device.pair.reject` | done | src/lib/openclaw/nodes.ts | |
| device.pair.remove | Remove paired device | `device.pair.remove` | done | src/lib/openclaw/nodes.ts | |
| device.token.rotate | Rotate device token | `device.token.rotate` | done | src/lib/openclaw/nodes.ts | |
| device.token.revoke | Revoke device token | `device.token.revoke` | done | src/lib/openclaw/nodes.ts | |
| exec.approvals.get | Get exec approvals | `exec.approvals.get` | done | src/lib/openclaw/nodes.ts | |
| exec.approvals.node.get | Get node exec approvals | `exec.approvals.node.get` | done | src/lib/openclaw/nodes.ts | |
| exec.approval.resolve | Resolve exec approval | `exec.approval.resolve` | done | src/lib/openclaw/nodes.ts | |
| exec.approvals.set | Set exec approvals policy | `exec.approvals.set` | done | src/lib/openclaw/nodes.ts | |
| exec.approvals.node.set | Set node exec approvals policy | `exec.approvals.node.set` | done | src/lib/openclaw/nodes.ts | |
| exec.approval.request | Request exec approval (one-shot) | `exec.approval.request` | gap | — | initiate approval request |
| exec.approval.get | Get pending exec approval | `exec.approval.get` | gap | — | lookup approval status |
| exec.approval.list | List pending exec approvals | `exec.approval.list` | gap | — | approval management UI |

## Approvals
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| plugin.approval.request | Request plugin approval | `plugin.approval.request` | gap | — | plugin-defined approval flow |
| plugin.approval.list | List plugin approvals | `plugin.approval.list` | gap | — | plugin approval management UI |
| plugin.approval.resolve | Resolve plugin approval | `plugin.approval.resolve` | gap | — | approve/reject plugin action |

## Features
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| tts.status | TTS enabled state | `tts.status` | done | src/lib/openclaw/features.ts | |
| tts.providers | TTS provider inventory | `tts.providers` | done | src/lib/openclaw/features.ts | |
| tts.enable | Enable TTS | `tts.enable` | done | src/lib/openclaw/features.ts | |
| tts.disable | Disable TTS | `tts.disable` | done | src/lib/openclaw/features.ts | |
| tts.setProvider | Set TTS provider | `tts.setProvider` | done | src/lib/openclaw/features.ts | |
| tts.convert | One-shot TTS conversion | `tts.convert` | gap | — | audio playback beyond current TTS UI |
| voicewake.get | Wake-word triggers | `voicewake.get` | done | src/lib/openclaw/features.ts | |
| voicewake.set | Update wake-word triggers | `voicewake.set` | done | src/lib/openclaw/features.ts | |
| talk.catalog | Talk provider catalog | `talk.catalog` | gap | — | voice/realtime provider picker |
| talk.config | Talk config payload | `talk.config` | gap | — | voice/realtime config |
| talk.session.create | Create Talk session | `talk.session.create` | gap | — | needs WebRTC/realtime stack; defer v1.1 |
| talk.session.join | Join Talk session | `talk.session.join` | gap | — | realtime voice |
| talk.session.appendAudio | Append audio to Talk session | `talk.session.appendAudio` | gap | — | realtime voice |
| talk.session.startTurn | Start Talk turn | `talk.session.startTurn` | gap | — | realtime voice |
| talk.session.endTurn | End Talk turn | `talk.session.endTurn` | gap | — | realtime voice |
| talk.session.cancelTurn | Cancel Talk turn | `talk.session.cancelTurn` | gap | — | realtime voice |
| talk.session.cancelOutput | Cancel Talk output | `talk.session.cancelOutput` | gap | — | realtime voice VAD barge-in |
| talk.session.submitToolResult | Submit Talk tool result | `talk.session.submitToolResult` | gap | — | realtime voice tool calls |
| talk.session.close | Close Talk session | `talk.session.close` | gap | — | realtime voice |
| talk.mode | Set Talk mode | `talk.mode` | gap | — | WebChat/Control UI state |
| talk.client.create | Create client-owned realtime session | `talk.client.create` | gap | — | WebRTC client-owned session |
| talk.client.toolCall | Forward client tool calls | `talk.client.toolCall` | gap | — | realtime tool call forwarding |
| talk.event | Talk event channel | `talk.event` | gap | — | realtime event stream |
| talk.speak | Synthesize speech | `talk.speak` | gap | — | single-turn TTS |
| push.test | Test APNs push | `push.test` | gap | — | push notification diagnostics |
| channels.status | Channel/plugin status | `channels.status` | gap | — | connection status per channel |
| channels.logout | Channel logout | `channels.logout` | gap | — | account management |
| web.login.start | Start QR/web login flow | `web.login.start` | oos | — | webchat-specific; not mobile |
| web.login.wait | Wait for QR/web login | `web.login.wait` | oos | — | webchat-specific; not mobile |

## Logs
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| logs.tail | Gateway log tail | `logs.tail` | done | src/lib/openclaw/logs.ts | |

## Memory
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| memory.search | Hybrid session search | tool `memory_search` | partial | docs/plans/memory-search.md | UI shipping; binding pending |
| memory.wiki.search | Search memory wiki | tool `wiki_search` | gap | — | user-facing: "what does agent remember about X" on mobile |
| memory.wiki.get | Read wiki page | tool `wiki_get` | gap | — | mobile reader for provenance-rich vault |
| memory.wiki.apply | Write/update wiki | tool `wiki_apply` | gap | — | low priority on mobile; gate behind admin role |
| memory.wiki.lint | Lint wiki vault | tool `wiki_lint` | gap | — | likely server-side; expose status in mobile diagnostics |
| memory.dreaming.review | Review DREAMS.md output | file read | gap | — | memory consolidation review tab |
| memory.dreaming.toggle | Enable/disable dreaming | config flag | gap | — | settings toggle; low effort once config UI exists |
| doctor.memory.status | Vector-memory readiness | `doctor.memory.status` | gap | — | memory diagnostics |
| doctor.memory.remHarness | REM harness preview | `doctor.memory.remHarness` | gap | — | remote control-plane memory view |

## Telemetry
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| usage.status | Usage quota summaries | `usage.status` | done | src/lib/openclaw/features.ts | |
| usage.cost | Aggregated cost usage | `usage.cost` | done | src/lib/openclaw/features.ts | |
| diagnostics.stability | Diagnostic stability recorder | `diagnostics.stability` | gap | — | debug/admin view |

## Tools (gateway RPC)
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| tools.catalog | Runtime tool catalog | `tools.catalog` | done | src/lib/openclaw/client.ts | |
| tools.effective | Session-effective tool inventory | `tools.effective` | gap | — | per-session tool visibility |
| tools.invoke | Invoke tool via gateway | `tools.invoke` | gap | — | operator tool invocation |

## Tools (agent tools)
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| tool.exec | Execute command | tool `exec` | gap | — | exec tool for agent runtime |
| tool.process | Process management | tool `process` | gap | — | process management tool |
| tool.code_execution | Code execution | tool `code_execution` | gap | — | provider-backed Python analysis |
| tool.read | Read workspace files | tool `read` | gap | — | workspace file read |
| tool.write | Write workspace files | tool `write` | gap | — | workspace file write |
| tool.edit | Edit workspace files | tool `edit` | gap | — | surgical file edit |
| tool.apply_patch | Apply patch to file | tool `apply_patch` | gap | — | patch application |
| tool.web_search | Web search | tool `web_search` | gap | — | web search provider |
| tool.x_search | X/Twitter search | tool `x_search` | gap | — | X/Twitter post search |
| tool.web_fetch | Fetch web content | tool `web_fetch` | gap | — | readable page content |
| tool.browser | Browser sessions | tool `browser` | gap | — | headless browser control |
| tool.message | Send channel message | tool `message` | gap | — | channel reply or action |
| tool.subagents | Delegate to subagents | tool `subagents` | gap | — | multi-agent delegation |
| tool.agents_list | List agents | tool `agents_list` | gap | — | agent enumeration tool |
| tool.session_status | Report session status | tool `session_status` | gap | — | session status tool |
| tool.cron | Schedule cron work | tool `cron` | gap | — | automation tool |
| tool.heartbeat_respond | Respond to heartbeat | tool `heartbeat_respond` | gap | — | heartbeat event handler |
| tool.gateway | Inspect gateway state | tool `gateway` | gap | — | gateway inspection tool |
| tool.nodes | Paired node operations | tool `nodes` | gap | — | node operations tool |
| tool.image | Analyze image | tool `image` | gap | — | image analysis |
| tool.image_generate | Generate image | tool `image_generate` | gap | — | image generation |
| tool.music_generate | Generate music | tool `music_generate` | gap | — | music generation |
| tool.video_generate | Generate video | tool `video_generate` | gap | — | video generation |
| tool.tts | Text-to-speech | tool `tts` | gap | — | TTS tool |
| tool.tool_search_code | Tool search (code mode) | tool `tool_search_code` | gap | — | search large tool catalogs |
| tool.tool_search | Tool search | tool `tool_search` | gap | — | tool discovery |
| tool.tool_describe | Describe tool | tool `tool_describe` | gap | — | tool schema lookup |

## Experimental flags
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| flag.agents_defaults_experimental_localModelLean | Local model lean mode | flag `agents.defaults.experimental.localModelLean` | gap | — | settings toggle for weak local backends |
| flag.agents_defaults_memorySearch_experimental_sessionMemory | Session memory search | flag `agents.defaults.memorySearch.experimental.sessionMemory` | gap | — | extra storage cost; expose in memory settings |
| flag.tools_experimental_planTool | Structured plan tool | flag `tools.experimental.planTool` | gap | — | expose in advanced tools settings |

## Channels
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| channel.discord | Discord | n/a | oos | — | gateway-side bridge; mobile is direct client |
| channel.feishu | Feishu/Lark | n/a | oos | — | gateway-side bridge |
| channel.googlechat | Google Chat | n/a | oos | — | gateway-side bridge |
| channel.imessage | iMessage | n/a | oos | — | gateway-side bridge |
| channel.irc | IRC | n/a | oos | — | gateway-side bridge |
| channel.line | LINE | n/a | oos | — | gateway-side bridge |
| channel.matrix | Matrix | n/a | oos | — | gateway-side bridge |
| channel.mattermost | Mattermost | n/a | oos | — | gateway-side bridge |
| channel.msteams | Microsoft Teams | n/a | oos | — | gateway-side bridge |
| channel.nextcloud-talk | Nextcloud Talk | n/a | oos | — | gateway-side bridge |
| channel.nostr | Nostr | n/a | oos | — | gateway-side bridge |
| channel.qqbot | QQ Bot | n/a | oos | — | gateway-side bridge |
| channel.signal | Signal | n/a | oos | — | gateway-side bridge |
| channel.slack | Slack | n/a | oos | — | gateway-side bridge |
| channel.synology-chat | Synology Chat | n/a | oos | — | gateway-side bridge |
| channel.telegram | Telegram | n/a | oos | — | gateway-side bridge |
| channel.tlon | Tlon | n/a | oos | — | gateway-side bridge |
| channel.twitch | Twitch | n/a | oos | — | gateway-side bridge |
| channel.wechat | WeChat | n/a | oos | — | gateway-side bridge |
| channel.whatsapp | WhatsApp | n/a | oos | — | gateway-side bridge |
| channel.yuanbao | Yuanbao | n/a | oos | — | gateway-side bridge |
| channel.zalo | Zalo | n/a | oos | — | gateway-side bridge |
| channel.zalouser | Zalo Personal | n/a | oos | — | gateway-side bridge |

## Providers
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| provider.alibaba | Alibaba Model Studio | n/a | gap | — | expose active provider in settings |
| provider.anthropic | Anthropic (API + Claude CLI) | n/a | gap | — | expose active provider in settings |
| provider.arcee | Arcee AI (Trinity models) | n/a | gap | — | expose active provider in settings |
| provider.azure-speech | Azure Speech | n/a | gap | — | TTS/speech provider |
| provider.bedrock | Amazon Bedrock | n/a | gap | — | expose active provider in settings |
| provider.bedrock-mantle | Amazon Bedrock Mantle | n/a | gap | — | expose active provider in settings |
| provider.cerebras | Cerebras | n/a | gap | — | expose active provider in settings |
| provider.chutes | Chutes | n/a | gap | — | expose active provider in settings |
| provider.cloudflare-ai-gateway | Cloudflare AI Gateway | n/a | gap | — | expose active provider in settings |
| provider.comfy | ComfyUI | n/a | gap | — | image generation provider |
| provider.deepseek | DeepSeek | n/a | gap | — | expose active provider in settings |
| provider.ds4 | ds4 (local DeepSeek V4) | n/a | gap | — | local model provider |
| provider.elevenlabs | ElevenLabs | n/a | gap | — | TTS/speech provider |
| provider.fal | fal | n/a | gap | — | media generation provider |
| provider.fireworks | Fireworks | n/a | gap | — | expose active provider in settings |
| provider.github-copilot | GitHub Copilot | n/a | gap | — | expose active provider in settings |
| provider.glm | GLM models | n/a | gap | — | expose active provider in settings |
| provider.google | Google (Gemini) | n/a | gap | — | expose active provider in settings |
| provider.gradium | Gradium | n/a | gap | — | expose active provider in settings |
| provider.groq | Groq (LPU inference) | n/a | gap | — | expose active provider in settings |
| provider.huggingface | Hugging Face (Inference) | n/a | gap | — | expose active provider in settings |
| provider.inferrs | inferrs (local models) | n/a | gap | — | local model provider |
| provider.kilocode | Kilocode | n/a | gap | — | expose active provider in settings |
| provider.litellm | LiteLLM (unified gateway) | n/a | gap | — | expose active provider in settings |
| provider.lmstudio | LM Studio (local models) | n/a | gap | — | local model provider |
| provider.minimax | MiniMax | n/a | gap | — | expose active provider in settings |
| provider.mistral | Mistral | n/a | gap | — | expose active provider in settings |
| provider.moonshot | Moonshot AI (Kimi) | n/a | gap | — | expose active provider in settings |
| provider.nvidia | NVIDIA | n/a | gap | — | expose active provider in settings |
| provider.ollama | Ollama (cloud + local) | n/a | gap | — | local model provider |
| provider.openai | OpenAI (API + Codex) | n/a | gap | — | expose active provider in settings |
| provider.opencode | OpenCode | n/a | gap | — | expose active provider in settings |
| provider.opencode-go | OpenCode Go | n/a | gap | — | expose active provider in settings |
| provider.openrouter | OpenRouter | n/a | gap | — | expose active provider in settings |
| provider.perplexity-provider | Perplexity | n/a | gap | — | expose active provider in settings |
| provider.qianfan | Qianfan (Baidu) | n/a | gap | — | expose active provider in settings |
| provider.qwen | Qwen (Alibaba) | n/a | gap | — | expose active provider in settings |
| provider.runway | Runway | n/a | gap | — | video generation provider |
| provider.senseaudio | SenseAudio | n/a | gap | — | TTS/speech provider |
| provider.sglang | SGLang (local inference) | n/a | gap | — | local model provider |
| provider.stepfun | StepFun | n/a | gap | — | expose active provider in settings |
| provider.synthetic | Synthetic (test provider) | n/a | oos | — | test/development provider; not user-facing |
| provider.tencent | Tencent | n/a | gap | — | expose active provider in settings |
| provider.together | Together AI | n/a | gap | — | expose active provider in settings |
| provider.venice | Venice | n/a | gap | — | expose active provider in settings |
| provider.vercel-ai-gateway | Vercel AI Gateway | n/a | gap | — | expose active provider in settings |
| provider.vllm | vLLM (local inference) | n/a | gap | — | local model provider |
| provider.volcengine | VolcEngine (ByteDance) | n/a | gap | — | expose active provider in settings |
| provider.vydra | Vydra | n/a | gap | — | expose active provider in settings |
| provider.xai | xAI (Grok) | n/a | gap | — | expose active provider in settings |
| provider.xiaomi | Xiaomi | n/a | gap | — | expose active provider in settings |
| provider.zai | ZAI | n/a | gap | — | expose active provider in settings |

## Events
| id | capability | rpc/event | status | client ref | notes |
|---|---|---|---|---|---|
| event.chat | Chat transcript updates | `chat` | done | src/lib/openclaw/client.ts | |
| event.chat_inject | Chat inject event | `chat.inject` | gap | — | server-side transcript-only event |
| event.session_message | Session message updates | `session.message` | gap | — | session subscription events |
| event.session_operation | In-flight session operation | `session.operation` | gap | — | session subscription events |
| event.session_tool | Session tool event stream | `session.tool` | gap | — | session subscription events |
| event.sessions_changed | Session index changed | `sessions.changed` | done | src/lib/openclaw/client.ts | |
| event.presence | Presence snapshot update | `presence` | done | src/lib/openclaw/client.ts | |
| event.tick | Keepalive tick | `tick` | done | src/lib/openclaw/client.ts | |
| event.health | Health snapshot update | `health` | gap | — | health status push |
| event.heartbeat | Heartbeat event stream | `heartbeat` | gap | — | heartbeat monitor |
| event.cron | Cron run/job change | `cron` | gap | — | live cron status |
| event.shutdown | Gateway shutdown | `shutdown` | done | src/lib/openclaw/client.ts | delays reconnect by restartExpectedMs (default 30s); emits gatewayShutdown event |
| event.node_pair_requested | Node pair requested | `node.pair.requested` | gap | — | node pairing flow |
| event.node_pair_resolved | Node pair resolved | `node.pair.resolved` | gap | — | node pairing flow |
| event.node_invoke_request | Node invoke request | `node.invoke.request` | gap | — | node invocation |
| event.device_pair_requested | Device pair requested | `device.pair.requested` | gap | — | device pairing modal |
| event.device_pair_resolved | Device pair resolved | `device.pair.resolved` | gap | — | device pairing modal |
| event.voicewake_changed | Wake-word config changed | `voicewake.changed` | gap | — | voicewake settings live update |
| event.exec_approval_requested | Exec approval requested | `exec.approval.requested` | done | src/lib/openclaw/client.ts | |
| event.exec_approval_resolved | Exec approval resolved | `exec.approval.resolved` | gap | — | approval resolution feedback |
| event.plugin_approval_requested | Plugin approval requested | `plugin.approval.requested` | gap | — | plugin approval flow |
| event.plugin_approval_resolved | Plugin approval resolved | `plugin.approval.resolved` | gap | — | plugin approval flow |
| event.chat_side_result | Chat side result | `chat.side_result` | done | src/lib/openclaw/client.ts | |
| event.agent | Agent delivery event | `agent` | done | src/lib/openclaw/client.ts | |

---

## Triage loop

When the watcher files an issue:
1. Add a row with `status: gap` and a link to the roadmap plan under `docs/plans/`, OR
2. Mark `oos` with a written reason in `notes`, OR
3. Fold into an existing roadmap plan.

OOS is only for: deployment targets (Docker/Nix/K8s/Fly/Hetzner), plugin SDK internals
(HTTP routes, context engines, agent harness), channel-bridge mechanics for channels
mobile doesn't run, and gateway config that only makes sense in a server admin TUI.
Anything user-facing defaults to `gap` — explicit "no" decision required to flip to `oos`.
