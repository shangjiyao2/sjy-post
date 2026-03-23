import React, { useRef, useEffect } from 'react';
import { Tooltip } from 'antd';
import './VariableHighlightInput.css';

interface VariableHighlightInputProps {
  value: string;
  onChange: (value: string) => void;
  onPressEnter?: () => void;
  placeholder?: string;
  className?: string;
  variables?: Record<string, string>;
}

const VariableHighlightInput: React.FC<VariableHighlightInputProps> = ({
  value,
  onChange,
  onPressEnter,
  placeholder,
  className,
  variables,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll position between input and highlight overlay
  const syncScroll = () => {
    if (inputRef.current && highlightRef.current) {
      highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.addEventListener('scroll', syncScroll);
      return () => input.removeEventListener('scroll', syncScroll);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onPressEnter) {
      onPressEnter();
    }
  };

  // Render the text with variable highlighting
  const renderHighlightedText = () => {
    if (!value) return null;

    const parts: React.ReactNode[] = [];
    const regex = /(\{\{[^}]+\}\})/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(value)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`} className="normal-text">
            {value.substring(lastIndex, match.index)}
          </span>
        );
      }

      // Add the variable with highlighting and optional tooltip
      const varText = match[0];
      const varName = varText.slice(2, -2); // strip {{ and }}
      const resolvedValue = variables?.[varName];

      const variableSpan = (
        <span
          key={`var-${match.index}`}
          className={`variable-highlight ${resolvedValue !== undefined ? 'variable-interactive' : ''}`}
        >
          {varText}
        </span>
      );

      if (resolvedValue !== undefined) {
        parts.push(
          <Tooltip
            key={`tip-${match.index}`}
            title={resolvedValue || '(empty)'}
            placement="bottom"
            mouseEnterDelay={0.3}
          >
            {variableSpan}
          </Tooltip>
        );
      } else {
        parts.push(variableSpan);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last variable
    if (lastIndex < value.length) {
      parts.push(
        <span key={`text-${lastIndex}`} className="normal-text">
          {value.substring(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  return (
    <div className={`variable-highlight-input ${className || ''}`}>
      <div className="highlight-overlay" ref={highlightRef}>
        {renderHighlightedText()}
      </div>
      <input
        ref={inputRef}
        type="text"
        className="actual-input"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        onScroll={syncScroll}
      />
    </div>
  );
};

export default VariableHighlightInput;
