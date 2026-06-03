import { useState } from 'react';
import { Input, Modal, Typography } from 'antd';

type AiSearchModalProps = {
  open: boolean;
  onSearch: (query: string) => void;
  onClose: () => void;
};

/** 자연어로 트래픽을 검색하는 입력 모달 (#23). */
export const AiSearchModal = ({ open, onSearch, onClose }: AiSearchModalProps) => {
  const [query, setQuery] = useState('');

  const submit = () => {
    if (!query.trim()) return;
    onSearch(query.trim());
    setQuery('');
  };

  return (
    <Modal title="AI 자연어 검색" open={open} onCancel={onClose} onOk={submit} okText="검색">
      <Typography.Paragraph type="secondary">
        예: "어제 실패한 결제 요청", "느린 GET 요청", "401 받은 호출"
      </Typography.Paragraph>
      <Input.Search
        placeholder="찾고 싶은 트래픽을 자연어로 설명하세요"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onSearch={submit}
        enterButton="검색"
      />
    </Modal>
  );
};
