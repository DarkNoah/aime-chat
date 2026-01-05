import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: '快速开始',
      items: [
        'getting-started/installation',
        'getting-started/basic-usage',
        'getting-started/ai-providers',
      ],
    },
    {
      type: 'category',
      label: '功能特性',
      items: [
        'features/knowledge-base',
        {
          type: 'category',
          label: 'Tools 工具',
          items: ['features/tools/overview', 'features/tools/rmbg'],
        },
        'features/agents',
        'features/mcp',
        'features/ptc',
        'features/transl',
        // {
        //   type: 'category',
        //   label: '记忆系统',
        //   items: [],
        // },
      ],
    },
    {
      type: 'category',
      label: 'Agent智能体',
      items: ['agents/overview', 'agents/code-agent'],
    },
  ],

  // But you can create a sidebar manually
  /*
  tutorialSidebar: [
    'intro',
    'hello',
    {
      type: 'category',
      label: 'Tutorial',
      items: ['tutorial-basics/create-a-document'],
    },
  ],
   */
};

export default sidebars;
