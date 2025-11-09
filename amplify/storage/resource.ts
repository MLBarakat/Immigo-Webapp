import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'immigoModelStorage',
  access: (allow) => ({
    'public/*': [
      allow.guest.to(['read']),
    ],
  })
});
