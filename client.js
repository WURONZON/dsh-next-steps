/**
 * next-steps — browser half.
 *
 * Registers three seats through the slot system:
 *   - `sidebar.panellist`  the left-sidebar entry (icon; id === main panel key)
 *   - `main`               the "Next steps" page it opens
 *   - `conversation.input.dock`  the suggestion band above the composer
 *
 * Everything is read from the Host half over the package-private local
 * connection; this file has no other dependency than React from the module
 * table. A suggestion press writes the prompt into the composer as a draft
 * (`inputActions.setDraft`) and never submits it.
 */

window.__ModuleLoader__.load({
  id: 'dsh-next-steps',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'next-steps'

    const EN = {
      'sidebar.label': 'Next steps',
      'panel.eyebrow': 'Suggestions',
      'panel.title': 'Next steps',
      'panel.subtitle': 'Prompts you may want to send next, suggested after each finished turn.',
      'panel.live': 'Live',
      'panel.error': 'Suggestions are unavailable: {message}',
      'panel.refresh': 'Regenerate',
      'panel.copy': 'Copy',
      'panel.copied': 'Copied',
      'panel.copyFailed': 'Copy failed',
      'panel.generating': 'Reading the conversation and writing suggestions…',
      'panel.empty': 'No suggestions for this turn. Finish a turn with a substantive answer and check again.',
      'panel.emptyGlobal': 'No suggestions yet. Finish a turn in a conversation and come back.',
      'panel.idle': 'Waiting for the next finished turn.',
      'panel.session': 'Session',
      'panel.turn': 'Turn {n}',
      'panel.hint': 'Click a suggestion to copy it, then paste it into the prompt box. The plugin never sends a prompt on its own.',
      'band.next': 'next:',
      'band.error': 'next steps failed: {message}',
      'band.replace': 'Replace your draft?',
      'band.replaceConfirm': 'Replace',
      'band.replaceCancel': 'Cancel',
      'band.refresh': 'Regenerate',
      'band.refreshing': 'Regenerating…',
      'band.dismiss': 'dismiss',
      'band.loading': 'next steps…',
    }

    const ZH = {
      'sidebar.label': '下一步建议',
      'panel.eyebrow': '建议',
      'panel.title': '下一步建议',
      'panel.subtitle': '每轮回答结束后，为你预测接下来最可能发送的提示。',
      'panel.live': '实时',
      'panel.error': '暂时无法生成建议：{message}',
      'panel.refresh': '重新生成',
      'panel.copy': '复制',
      'panel.copied': '已复制',
      'panel.copyFailed': '复制失败',
      'panel.generating': '正在阅读对话并生成建议…',
      'panel.empty': '这一轮没有可用的建议。等下一次有实质内容的回答后再看。',
      'panel.emptyGlobal': '还没有建议。先在会话里完成一轮对话，再回来查看。',
      'panel.idle': '等待下一次回答结束。',
      'panel.session': '会话',
      'panel.turn': '第 {n} 轮',
      'panel.hint': '点击建议会复制到剪贴板，再粘贴到输入框。插件不会自行发送任何提示。',
      'band.next': '下一步：',
      'band.error': '下一步建议生成失败：{message}',
      'band.replace': '替换当前草稿？',
      'band.replaceConfirm': '替换',
      'band.replaceCancel': '取消',
      'band.refresh': '重新生成',
      'band.refreshing': '重新生成中…',
      'band.dismiss': '忽略',
      'band.loading': '生成下一步建议…',
    }

    const CSS = [
      '.nsx-panel{min-height:100%;height:100%;overflow-y:auto;box-sizing:border-box;padding:26px 30px 40px;color:var(--dsw-alias-label-primary);font-family:inherit}',
      '.nsx-inner{max-width:940px;margin:0 auto}',
      '.nsx-head{display:flex;align-items:flex-start;gap:16px}',
      '.nsx-head-main{flex:1;min-width:0}',
      '.nsx-eyebrow{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-brand-primary);font-weight:700}',
      '.nsx-title{font-size:22px;line-height:1.25;font-weight:650;margin:4px 0 0;letter-spacing:-.01em}',
      '.nsx-sub{margin:6px 0 0;font-size:12.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);max-width:62ch}',
      '.nsx-actions{display:flex;align-items:center;gap:10px;flex:none;padding-top:6px}',
      '.nsx-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:34ch;overflow:hidden;text-overflow:ellipsis}',
      '.nsx-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}',
      '.nsx-dot[data-status="loading"]{background:var(--dsw-alias-state-warn-primary)}',
      '.nsx-dot[data-status="error"]{background:var(--dsw-alias-state-error-primary)}',
      '.nsx-dot[data-status="empty"],.nsx-dot[data-status="idle"]{background:var(--dsw-alias-state-idle-primary)}',
      '.nsx-hint{margin:16px 0 0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.nsx-list{margin-top:18px;display:flex;flex-direction:column;gap:12px}',
      '.nsx-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:12px 14px 10px}',
      '.nsx-card-head{display:flex;align-items:center;gap:8px;min-width:0}',
      '.nsx-card-title{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.nsx-card-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none;margin-left:auto}',
      '.nsx-sug{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 0 2px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:9px}',
      '.nsx-sug-index{width:20px;height:20px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:650;color:var(--dsw-alias-label-secondary);line-height:1;box-sizing:border-box}',
      '.nsx-sug-body{min-width:0}',
      '.nsx-sug-label{font-size:12.5px;line-height:1.4;font-weight:550;overflow-wrap:anywhere}',
      '.nsx-sug-prompt{margin-top:3px;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.nsx-btn{font:inherit;font-size:11.5px;height:26px;padding:0 11px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap;flex:none}',
      '.nsx-btn:hover:enabled{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.nsx-btn:disabled{opacity:.5;cursor:default}',
      '.nsx-note{margin:8px 0 0;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.nsx-note-err{color:var(--dsw-alias-state-error-primary)}',
      '.nsx-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:28px 20px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.6;margin-top:18px}',
      '.nsx-band{box-sizing:border-box;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:6px 9px;margin:0 auto 8px;width:100%;max-width:860px}',
      '.nsx-band-label{font-size:11px;color:var(--dsw-alias-label-secondary);padding:0 2px;flex:none}',
      '.nsx-band-error{flex:1 1 100%;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.5;color:var(--dsw-alias-state-error-primary)}',
      '.nsx-chips{display:flex;gap:6px;flex-wrap:wrap;flex:1;min-width:0}',
      '.nsx-chip{font:inherit;display:inline-flex;align-items:center;gap:7px;max-width:100%;height:28px;padding:0 10px 0 6px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;box-sizing:border-box}',
      '.nsx-chip:hover:enabled{border-color:var(--dsw-alias-brand-primary)}',
      '.nsx-chip:disabled{opacity:.55;cursor:default}',
      '.nsx-chip-action{padding:0 10px}',
      '.nsx-chip-icon{display:inline-block;flex:none;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary)}',
      '.nsx-chip-icon[data-busy="true"]{animation:nsx-spin .9s linear infinite}',
      '@keyframes nsx-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.nsx-chip-icon[data-busy="true"]{animation:none}}',
      '.nsx-chip-n{width:17px;height:17px;border-radius:5px;background:var(--dsw-alias-bg-layer-1);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--dsw-alias-label-secondary);flex:none;line-height:1}',
      '.nsx-chip-text{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.nsx-chip-dismiss{flex:none;background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);padding:0 8px;font-size:11px;height:26px}',
      '.nsx-chip-dismiss:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}',
    ].join('\n')

    function Styles() {
      return h('style', { 'data-next-steps': '' }, CSS)
    }

    /** Absolute URL of one Host route on this package's private connection. */
    function endpoint(path) {
      return path
    }

    /**
     * Poll one Host route while mounted.
     * @param request stable JSON request body.
     * @param intervalMs poll interval.
     */
    function useHostState(request, intervalMs) {
      const key = JSON.stringify(request)
      const [state, setState] = React.useState({ value: null, error: null, loading: true })
      React.useEffect(() => {
        let alive = true
        let timer = null
        const parsed = JSON.parse(key)
        if (parsed !== null && typeof parsed === 'object' && parsed.sessionId === '') {
          // No Session yet: the band is not part of the tree, so nothing to ask.
          setState({ value: null, error: null, loading: false })
          return () => {
            alive = false
          }
        }
        const tick = async () => {
          try {
            const response = await fetch(endpoint('api/next-steps/state'), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: key,
            })
            if (!alive) return
            if (!response.ok) {
              setState((previous) => ({ value: previous.value, error: `HTTP ${response.status}`, loading: false }))
              return
            }
            const payload = await response.json()
            if (!alive) return
            if (payload !== null && typeof payload === 'object' && payload.ok === true) {
              setState({ value: payload.value, error: null, loading: false })
            } else {
              const message = payload !== null && typeof payload === 'object' && payload.error !== null && typeof payload.error === 'object' && typeof payload.error.message === 'string'
                ? payload.error.message
                : 'request failed'
              setState((previous) => ({ value: previous.value, error: message, loading: false }))
            }
          } catch (error) {
            if (alive) {
              setState((previous) => ({ value: previous.value, error: error instanceof Error ? error.message : String(error), loading: false }))
            }
          } finally {
            if (alive) timer = setTimeout(tick, intervalMs)
          }
        }
        tick()
        return () => {
          alive = false
          if (timer !== null) clearTimeout(timer)
        }
      }, [key, intervalMs])
      return state
    }

    function timeLabel(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return ''
      try {
        const date = new Date(ms)
        const now = new Date()
        if (date.toDateString() === now.toDateString()) {
          return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        }
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      } catch {
        return ''
      }
    }

    /** Sidebar rail icon; inherits the row's color through `currentColor`. */
    function Icon(props) {
      const size = props !== null && props !== undefined && typeof props.size === 'number' ? props.size : 18
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        h('path', { key: 'a', d: 'M3.2 5.4h6.4' }),
        h('path', { key: 'b', d: 'M3.2 10h8' }),
        h('path', { key: 'c', d: 'M3.2 14.6h5.2' }),
        h('path', { key: 'd', d: 'M14.4 6.6 17 10l-2.6 3.4' }),
      )
    }

    /**
     * Build the three seat components against one translate function, so every
     * label follows the active locale.
     */
    function componentsFor(t) {
      function Panel() {
        const state = useHostState({ all: true }, 3000)
        const value = state.value
        const sessions = value !== null && typeof value === 'object' && Array.isArray(value.sessions) ? value.sessions : []
        const [flash, setFlash] = React.useState(null)
        const [busy, setBusy] = React.useState('')
        const flashTimer = React.useRef(null)
        React.useEffect(
          () => () => {
            if (flashTimer.current !== null) clearTimeout(flashTimer.current)
          },
          [],
        )
        const pulse = (key, ok) => {
          setFlash({ key, ok })
          if (flashTimer.current !== null) clearTimeout(flashTimer.current)
          flashTimer.current = setTimeout(() => setFlash(null), 1600)
        }
        const copy = (key, text) => {
          try {
            const clipboard = navigator.clipboard
            if (clipboard !== null && clipboard !== undefined && typeof clipboard.writeText === 'function') {
              clipboard.writeText(text).then(
                () => pulse(key, true),
                () => pulse(key, false),
              )
              return
            }
          } catch {
            // Reported through the failed flash below.
          }
          pulse(key, false)
        }
        const regenerate = async (sessionId) => {
          setBusy(sessionId)
          try {
            await fetch(endpoint('api/next-steps/refresh'), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })
          } catch {
            // The state poll reports the failure.
          } finally {
            setBusy('')
          }
        }

        const anyLoading = sessions.some((item) => item !== null && typeof item === 'object' && item.status === 'loading')
        const headerStatus = state.error !== null ? 'error' : anyLoading ? 'loading' : 'ready'

        const card = (item) => {
          if (item === null || typeof item !== 'object') return null
          const sessionId = typeof item.sessionId === 'string' ? item.sessionId : ''
          if (sessionId === '') return null
          const status = typeof item.status === 'string' ? item.status : 'idle'
          const suggestions = Array.isArray(item.suggestions) ? item.suggestions : []
          const meta = typeof item.turn === 'number' && item.turn > 0 ? `${t('panel.turn', { n: item.turn })} · ${timeLabel(item.at)}` : timeLabel(item.at)
          return h(
            'section',
            { className: 'nsx-card', key: sessionId },
            h(
              'div',
              { className: 'nsx-card-head' },
              h('span', { className: 'nsx-dot', 'data-status': status === 'ready' ? 'ready' : status }),
              h('span', { className: 'nsx-card-title', title: typeof item.cwd === 'string' ? item.cwd : undefined }, typeof item.label === 'string' && item.label !== '' ? item.label : t('panel.session')),
              h('span', { className: 'nsx-card-meta' }, meta),
              h(
                'button',
                {
                  className: 'nsx-btn',
                  type: 'button',
                  disabled: busy === sessionId || status === 'loading',
                  onClick: () => {
                    void regenerate(sessionId)
                  },
                },
                t('panel.refresh'),
              ),
            ),
            status === 'error' ? h('p', { className: 'nsx-note nsx-note-err' }, t('panel.error', { message: typeof item.error === 'string' ? item.error : '' })) : null,
            status === 'loading' ? h('p', { className: 'nsx-note' }, t('panel.generating')) : null,
            status === 'empty' ? h('p', { className: 'nsx-note' }, t('panel.empty')) : null,
            status === 'idle' ? h('p', { className: 'nsx-note' }, t('panel.idle')) : null,
            suggestions.map((suggestion, index) => {
              const suggestionKey = `${sessionId}#${index}`
              const label = flash !== null && flash.key === suggestionKey ? (flash.ok ? t('panel.copied') : t('panel.copyFailed')) : t('panel.copy')
              const prompt = suggestion !== null && typeof suggestion === 'object' && typeof suggestion.prompt === 'string' ? suggestion.prompt : ''
              const shown = suggestion !== null && typeof suggestion === 'object' && typeof suggestion.label === 'string' && suggestion.label !== '' ? suggestion.label : prompt
              return h(
                'div',
                { className: 'nsx-sug', key: suggestionKey },
                h('span', { className: 'nsx-sug-index' }, String(index + 1)),
                h('div', { className: 'nsx-sug-body' }, h('div', { className: 'nsx-sug-label' }, shown), h('div', { className: 'nsx-sug-prompt' }, prompt)),
                h('button', { className: 'nsx-btn', type: 'button', onClick: () => copy(suggestionKey, prompt) }, label),
              )
            }),
          )
        }

        return h(
          'div',
          { className: 'nsx-panel' },
          h(Styles, { key: 'styles' }),
          h(
            'div',
            { className: 'nsx-inner' },
            h(
              'div',
              { className: 'nsx-head' },
              h(
                'div',
                { className: 'nsx-head-main' },
                h('div', { className: 'nsx-eyebrow' }, t('panel.eyebrow')),
                h('h1', { className: 'nsx-title' }, t('panel.title')),
                h('p', { className: 'nsx-sub' }, t('panel.subtitle')),
              ),
              h(
                'div',
                { className: 'nsx-actions' },
                h(
                  'span',
                  { className: 'nsx-state', title: state.error === null ? '' : state.error },
                  h('span', { className: 'nsx-dot', 'data-status': headerStatus }),
                  state.error === null ? t('panel.live') : t('panel.error', { message: state.error }),
                ),
              ),
            ),
            h('p', { className: 'nsx-hint' }, t('panel.hint')),
            sessions.length === 0
              ? h('div', { className: 'nsx-empty' }, state.loading ? t('panel.generating') : t('panel.emptyGlobal'))
              : h('div', { className: 'nsx-list' }, sessions.map(card)),
          ),
        )
      }

      function Dock(props) {
        const sessionId = props !== null && props !== undefined && typeof props.sessionId === 'string' ? props.sessionId : ''
        const inputActions = props !== null && props !== undefined ? props.inputActions : undefined
        const useInput = props !== null && props !== undefined ? props.useInput : undefined
        const input = typeof useInput === 'function' ? useInput((snapshot) => snapshot) : null
        const state = useHostState({ sessionId }, 2000)
        const value = state.value
        const entry = value !== null && typeof value === 'object' && Array.isArray(value.sessions) ? value.sessions[0] : undefined
        const at = entry !== null && entry !== undefined && typeof entry.at === 'number' ? entry.at : 0
        const status = entry !== null && entry !== undefined && typeof entry.status === 'string' ? entry.status : ''
        const draftRev = input !== null && input !== undefined && typeof input.draftRev === 'number' ? input.draftRev : null
        const [dismissed, setDismissed] = React.useState(0)
        React.useEffect(() => {
          setDismissed(0)
        }, [at])
        const [dismissedError, setDismissedError] = React.useState('')
        const [pendingFill, setPendingFill] = React.useState(null)
        const [regenerating, setRegenerating] = React.useState(false)
        const [refreshError, setRefreshError] = React.useState('')
        // A fresh round or any edit to the draft invalidates a pending replace;
        // the regenerate spinner and its error keep their own reset trigger.
        React.useEffect(() => {
          setPendingFill(null)
        }, [at, status, draftRev])
        React.useEffect(() => {
          setRegenerating(false)
          setRefreshError('')
        }, [at, status])
        if (sessionId === '' || entry === undefined || entry === null) return null
        const phase = input !== null && input !== undefined && typeof input.phase === 'string' ? input.phase : 'plain'
        if (phase !== 'plain') return null
        const items = Array.isArray(entry.suggestions) ? entry.suggestions : []
        // Replacing a non-empty draft is destructive, so a suggestion press asks
        // first instead of overwriting what the user already typed.
        const draft = input !== null && input !== undefined && typeof input.draft === 'string' ? input.draft : ''
        const commit = (prompt) => {
          try {
            if (inputActions !== null && inputActions !== undefined && typeof inputActions.setDraft === 'function') {
              inputActions.setDraft(prompt)
            }
          } catch (error) {
            console.error('next-steps: could not write the draft', error)
          } finally {
            setDismissed(at)
            setPendingFill(null)
          }
        }
        const fill = (prompt) => {
          if (draft.trim() !== '') {
            setPendingFill(prompt)
            return
          }
          commit(prompt)
        }
        // Regenerate this Session's suggestions in place. The Host clears the
        // old list and reports loading on the next state poll, so the button
        // stays disabled until that poll or a failed request settles it.
        const refresh = async () => {
          if (regenerating) return
          setRegenerating(true)
          setRefreshError('')
          setDismissed(0)
          setPendingFill(null)
          setDismissedError('')
          try {
            const response = await fetch(endpoint('api/next-steps/refresh'), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })
            if (!response.ok) {
              setRegenerating(false)
              setRefreshError('HTTP ' + response.status)
              return
            }
            const payload = await response.json()
            if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
              const message = payload !== null && typeof payload === 'object' && payload.error !== null && typeof payload.error === 'object' && typeof payload.error.message === 'string'
                ? payload.error.message
                : 'request failed'
              setRegenerating(false)
              setRefreshError(message)
            }
          } catch (error) {
            setRegenerating(false)
            setRefreshError(error instanceof Error ? error.message : String(error))
          }
        }
        const regenerateButton = h(
          'button',
          {
            className: 'nsx-chip nsx-chip-action',
            type: 'button',
            disabled: regenerating,
            'aria-busy': regenerating ? 'true' : undefined,
            onClick: () => {
              void refresh()
            },
          },
          h('span', { className: 'nsx-chip-icon', 'data-busy': regenerating ? 'true' : 'false', 'aria-hidden': true }, '↻'),
          h('span', { className: 'nsx-chip-text' }, regenerating ? t('band.refreshing') : t('band.refresh')),
        )
        if (refreshError !== '') {
          return h(
            'div',
            { className: 'nsx-band' },
            h(Styles, { key: 'styles' }),
            h('span', { className: 'nsx-band-label nsx-band-error' }, t('band.error', { message: refreshError })),
            regenerateButton,
            h('button', { className: 'nsx-chip nsx-chip-dismiss', type: 'button', onClick: () => setRefreshError('') }, t('band.dismiss')),
          )
        }
        // A failed round keeps its error visible until this exact error is
        // dismissed; a dismissal from an earlier round must not hide it.
        if (status === 'error') {
          const message = typeof entry.error === 'string' ? entry.error : ''
          const errorKey = `${entry.turn}:${at}:${message}`
          if (dismissedError === errorKey) return null
          return h(
            'div',
            { className: 'nsx-band' },
            h(Styles, { key: 'styles' }),
            h('span', { className: 'nsx-band-label nsx-band-error' }, t('band.error', { message })),
            regenerateButton,
            h('button', { className: 'nsx-chip nsx-chip-dismiss', type: 'button', onClick: () => setDismissedError(errorKey) }, t('band.dismiss')),
          )
        }
        if (status === 'loading') {
          return h('div', { className: 'nsx-band' }, h(Styles, { key: 'styles' }), h('span', { className: 'nsx-band-label' }, t('band.loading')))
        }
        if (pendingFill !== null) {
          return h(
            'div',
            { className: 'nsx-band' },
            h(Styles, { key: 'styles' }),
            h('span', { className: 'nsx-band-label' }, t('band.replace')),
            h('button', { className: 'nsx-btn', type: 'button', onClick: () => commit(pendingFill) }, t('band.replaceConfirm')),
            h('button', { className: 'nsx-chip nsx-chip-dismiss', type: 'button', onClick: () => setPendingFill(null) }, t('band.replaceCancel')),
          )
        }
        if (items.length === 0) return null
        if (at > 0 && dismissed === at) return null
        return h(
          'div',
          { className: 'nsx-band' },
          h(Styles, { key: 'styles' }),
          h('span', { className: 'nsx-band-label' }, t('band.next')),
          h(
            'div',
            { className: 'nsx-chips' },
            items.map((item, index) => {
              const prompt = item !== null && typeof item === 'object' && typeof item.prompt === 'string' ? item.prompt : ''
              const label = item !== null && typeof item === 'object' && typeof item.label === 'string' && item.label !== '' ? item.label : prompt
              return h(
                'button',
                { key: index, type: 'button', className: 'nsx-chip', title: prompt, onClick: () => fill(prompt) },
                h('span', { className: 'nsx-chip-n' }, String(index + 1)),
                h('span', { className: 'nsx-chip-text' }, label),
              )
            }),
          ),
          regenerateButton,
          h('button', { className: 'nsx-chip nsx-chip-dismiss', type: 'button', onClick: () => setDismissed(at) }, t('band.dismiss')),
        )
      }

      return { Panel, Dock }
    }

    return {
      name: NS,
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'next-steps: locale en')
        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'next-steps: locale zh')

        const translate = ctx.locale.bind(NS)
        const t = (key, params) => {
          let text
          try {
            text = translate(key)
          } catch {
            text = key
          }
          if (typeof text !== 'string' || text === '') text = key
          if (params === null || params === undefined) return text
          return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
        }

        const { Panel, Dock } = componentsFor(t)

        // Panel seats are switched off for this install: only the composer band
        // is shown. Remove the comment markers below to bring back the left-sidebar
        // entry (sidebar.panellist) and the "Next steps" page (main).
        const disposers = [
          /*
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              { name: 'sidebar.panellist', id: NS, order: 30, label: () => t('sidebar.label'), locale: NS },
              (props) => h(Icon, { size: props !== null && props !== undefined && typeof props.size === 'number' ? props.size : undefined }),
            ),
          ),
          ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: NS, locale: NS }, Panel)),
          */
          ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: NS, order: 15, locale: NS }, Dock)),
        ]

        ctx.effect(
          () => () => {
            for (const dispose of disposers) {
              try {
                dispose()
              } catch {
                // Already disposed.
              }
            }
          },
          'next-steps: placement',
        )
      },
    }
  },
})
