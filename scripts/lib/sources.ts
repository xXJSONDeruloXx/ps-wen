export type PublicSource = {
  id: string;
  url: string;
  purpose: string;
  tags: string[];
};

export const PUBLIC_SOURCES: PublicSource[] = [
  {
    id: 'ps-plus-pc-support',
    url: 'https://www.playstation.com/en-us/support/subscriptions/ps-plus-pc/',
    purpose: 'Official PS Plus on PC support and bandwidth guidance.',
    tags: ['official', 'pc', 'bandwidth']
  },
  {
    id: 'ps-portal-support',
    url: 'https://www.playstation.com/en-us/support/hardware/psportal/',
    purpose: 'Official PlayStation Portal support overview.',
    tags: ['official', 'portal', 'hardware']
  },
  {
    id: 'ps-portal-system-software',
    url: 'https://www.playstation.com/en-us/support/hardware/psportal/system-software-info/',
    purpose: 'Official PlayStation Portal system software notes for cloud streaming references.',
    tags: ['official', 'portal', 'system-software']
  },
  {
    id: 'ps-plus-landing',
    url: 'https://www.playstation.com/en-us/ps-plus/',
    purpose: 'Official PS Plus landing page for current cloud-streaming claims.',
    tags: ['official', 'subscription', 'marketing']
  }
];
