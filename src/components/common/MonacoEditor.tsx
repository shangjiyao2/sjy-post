import React, { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../stores/themeStore';
import './MonacoEditor.css';

export type EditorLanguage = 'json' | 'xml' | 'html' | 'text' | 'javascript';

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  height?: string | number;
  minimap?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  formatOnPaste?: boolean;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  onChange,
  language = 'json',
  readOnly = false,
  height = '100%',
  minimap = false,
  lineNumbers = true,
  wordWrap = true,
  formatOnPaste = true,
}) => {
  const isDark = useThemeStore((s) => s.isDark);
  const { t } = useTranslation();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleEditorDidMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    const wrapper = wrapperRef.current;

    if (wrapper) {
      requestAnimationFrame(() => {
        editor.layout({
          width: wrapper.clientWidth,
          height: wrapper.clientHeight,
        });
      });
    }

    // Add format document command (Shift+Alt+F)
    editor.addAction({
      id: 'format-document',
      label: 'Format Document',
      keybindings: [
        // Shift+Alt+F
        2048 + 512 + 36, // KeyMod.Shift + KeyMod.Alt + KeyCode.KeyF
      ],
      run: () => {
        editor.getAction('editor.action.formatDocument')?.run();
      },
    });
  }, []);

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (onChange && newValue !== undefined) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const currentEditor = editorRef.current;

    if (!wrapper || !currentEditor || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    let frameId: number | null = null;
    const syncLayout = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        currentEditor.layout({
          width: wrapper.clientWidth,
          height: wrapper.clientHeight,
        });
      });
    };

    syncLayout();

    const resizeObserver = new ResizeObserver(() => {
      syncLayout();
    });

    resizeObserver.observe(wrapper);

    return () => {
      resizeObserver.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [height]);

  return (
    <div className="monaco-editor-wrapper" style={{ height }} ref={wrapperRef}>
      <Editor
        height="100%"
        language={language === 'text' ? 'plaintext' : language}
        value={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme={isDark ? 'vs-dark' : 'light'}
        options={{
          readOnly,
          minimap: { enabled: minimap },
          lineNumbers: lineNumbers ? 'on' : 'off',
          wordWrap: wordWrap ? 'on' : 'off',
          formatOnPaste,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          fontSize: 14,
          fontFamily: 'var(--font-mono)',
          renderLineHighlight: 'line',
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          padding: { top: 8, bottom: 8 },
          folding: true,
          foldingHighlight: true,
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
        }}
        loading={<div className="monaco-loading">{t('monacoEditor.loading')}</div>}
      />
    </div>
  );
};

export default MonacoEditor;
