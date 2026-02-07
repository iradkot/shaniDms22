import React from 'react';
import {Text} from 'react-native';
import {MarkdownIt} from 'react-native-markdown-display';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

// ---------------------------------------------------------------------------
// Markdown-it instance (disable images for privacy/safety)
// ---------------------------------------------------------------------------

export function createMarkdownItInstance() {
  return MarkdownIt({typographer: true}).disable(['image']);
}

// ---------------------------------------------------------------------------
// Selectable markdown rules (allow text selection in chat bubbles)
// ---------------------------------------------------------------------------

export function createSelectableMarkdownRules(): Record<string, any> {
  return {
    text: (node: any, _children: any, _parent: any, styles: any, inheritedStyles: any = {}) => (
      <Text key={node.key} selectable style={[inheritedStyles, styles.text]}>
        {node.content}
      </Text>
    ),
    textgroup: (node: any, children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.textgroup}>
        {children}
      </Text>
    ),
    strong: (node: any, children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.strong}>
        {children}
      </Text>
    ),
    em: (node: any, children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.em}>
        {children}
      </Text>
    ),
    s: (node: any, children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.s}>
        {children}
      </Text>
    ),
    code_inline: (
      node: any,
      _children: any,
      _parent: any,
      styles: any,
      inheritedStyles: any = {},
    ) => (
      <Text key={node.key} selectable style={[inheritedStyles, styles.code_inline]}>
        {node.content}
      </Text>
    ),
    code_block: (
      node: any,
      _children: any,
      _parent: any,
      styles: any,
      inheritedStyles: any = {},
    ) => {
      let content = node.content;
      if (typeof content === 'string' && content.charAt(content.length - 1) === '\n') {
        content = content.substring(0, content.length - 1);
      }
      return (
        <Text key={node.key} selectable style={[inheritedStyles, styles.code_block]}>
          {content}
        </Text>
      );
    },
    fence: (
      node: any,
      _children: any,
      _parent: any,
      styles: any,
      inheritedStyles: any = {},
    ) => {
      let content = node.content;
      if (typeof content === 'string' && content.charAt(content.length - 1) === '\n') {
        content = content.substring(0, content.length - 1);
      }
      return (
        <Text key={node.key} selectable style={[inheritedStyles, styles.fence]}>
          {content}
        </Text>
      );
    },
    inline: (node: any, children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.inline}>
        {children}
      </Text>
    ),
    span: (node: any, children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.span}>
        {children}
      </Text>
    ),
    hardbreak: (node: any, _children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.hardbreak}>
        {'\n'}
      </Text>
    ),
    softbreak: (node: any, _children: any, _parent: any, styles: any) => (
      <Text key={node.key} selectable style={styles.softbreak}>
        {'\n'}
      </Text>
    ),
  };
}

// ---------------------------------------------------------------------------
// Markdown style factory (theme-aware)
// ---------------------------------------------------------------------------

export function createMarkdownStyle(theme: ThemeType) {
  return {
    body: {
      color: theme.textColor,
      fontSize: theme.typography.size.md,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
    },
    text: {
      color: theme.textColor,
      fontSize: theme.typography.size.md,
    },
    code_inline: {
      backgroundColor: addOpacity(theme.textColor, 0.06),
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    code_block: {
      backgroundColor: addOpacity(theme.textColor, 0.06),
      borderRadius: 8,
      padding: 10,
    },
    fence: {
      backgroundColor: addOpacity(theme.textColor, 0.06),
      borderRadius: 8,
      padding: 10,
    },
    link: {
      color: theme.accentColor,
    },
  };
}
