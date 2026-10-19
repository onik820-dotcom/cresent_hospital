import { createFileRoute } from '@tanstack/react-router';
import { Authed } from '@/components/authed';
import { ChatScreen } from '@/components/chat/chat-screen';

export const Route = createFileRoute('/chat')({
  ssr: false,
  component: ChatPage,
  head: () => ({
    meta: [
      { title: 'Assistant — J.H.M. Filling Station' },
      {
        name: 'description',
        content:
          'Ask the filling station assistant about sales, stock, dues and profit in Bangla or English, and have it prepare entries for you to confirm.',
      },
      { property: 'og:title', content: 'Assistant — J.H.M. Filling Station' },
      {
        property: 'og:description',
        content: 'A Bangla and English assistant over the station books, with every write confirmed by hand.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});

function ChatPage() {
  return (
    <Authed path="/chat" roles={['admin', 'md']}>
      {(profile) => <ChatScreen role={profile.role} fullName={profile.fullName} />}
    </Authed>
  );
}
