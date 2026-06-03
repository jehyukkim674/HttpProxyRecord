import { useRef, useState } from 'react';
import { Button, Drawer, Empty, Input, List, Segmented, Select, Space, Typography, message } from 'antd';
import { useGuides } from '../hooks/useGuides';
import { captureSource } from '../services/capture';
import { flattenStep } from '../services/flattenStep';
import { buildGuideHtml, nextBoxNumber } from '../../../shared/guide';
import { ipc } from '../services/ipc';
import type { GuideBox, GuideStep } from '../../../shared/types';
import { SourcePickerModal } from './SourcePickerModal';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const newId = (): string => globalThis.crypto.randomUUID();

type Props = { open: boolean; onClose: () => void };
type Rect = { x: number; y: number; w: number; h: number };

export const GuideBuilderDrawer = ({ open, onClose }: Props) => {
  const { guides, save, load } = useGuides();
  const [messageApi, holder] = message.useMessage();

  const [guideId, setGuideId] = useState<number | undefined>(undefined);
  const [title, setTitle] = useState('새 가이드');
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [newKind, setNewKind] = useState<'box' | 'blur'>('box');
  const [pickerOpen, setPickerOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  const currentStep = steps[stepIndex] ?? null;

  const updateStep = (index: number, next: GuideStep) =>
    setSteps((prev) => prev.map((step, i) => (i === index ? next : step)));

  const resetEditor = () => {
    setGuideId(undefined);
    setTitle('새 가이드');
    setSteps([]);
    setStepIndex(0);
  };

  const addCapture = async (sourceId: string) => {
    setPickerOpen(false);
    try {
      const imageDataUrl = await captureSource(sourceId);
      const step: GuideStep = { id: newId(), imageDataUrl, boxes: [] };
      setSteps((prev) => {
        setStepIndex(prev.length);
        return [...prev, step];
      });
    } catch {
      void messageApi.error('캡처 실패 — 화면 기록 권한을 확인하세요');
    }
  };

  const onMouseDown = (event: React.MouseEvent) => {
    if (!containerRef.current || !currentStep) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragStart.current = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    setDraft({ ...dragStart.current, w: 0, h: 0 });
  };

  const onMouseMove = (event: React.MouseEvent) => {
    if (!dragStart.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = clamp01((event.clientX - rect.left) / rect.width);
    const cy = clamp01((event.clientY - rect.top) / rect.height);
    const start = dragStart.current;
    setDraft({
      x: Math.min(start.x, cx),
      y: Math.min(start.y, cy),
      w: Math.abs(cx - start.x),
      h: Math.abs(cy - start.y),
    });
  };

  const onMouseUp = () => {
    if (draft && currentStep && draft.w > 0.01 && draft.h > 0.01) {
      const box: GuideBox = {
        id: newId(),
        ...draft,
        number: nextBoxNumber(currentStep.boxes),
        description: '',
        kind: newKind,
      };
      updateStep(stepIndex, { ...currentStep, boxes: [...currentStep.boxes, box] });
    }
    dragStart.current = null;
    setDraft(null);
  };

  const updateBox = (boxId: string, patch: Partial<GuideBox>) => {
    if (!currentStep) return;
    updateStep(stepIndex, {
      ...currentStep,
      boxes: currentStep.boxes.map((box) => (box.id === boxId ? { ...box, ...patch } : box)),
    });
  };

  const deleteBox = (boxId: string) => {
    if (!currentStep) return;
    updateStep(stepIndex, { ...currentStep, boxes: currentStep.boxes.filter((box) => box.id !== boxId) });
  };

  const onSave = async () => {
    const saved = await save({ id: guideId, title, steps });
    setGuideId(saved.id);
    void messageApi.success('가이드를 저장했어요');
  };

  const onLoad = async (id: number) => {
    const guide = await load(id);
    if (guide) {
      setGuideId(guide.id);
      setTitle(guide.title);
      setSteps(guide.steps);
      setStepIndex(0);
    }
  };

  const onExport = async () => {
    if (steps.length === 0) {
      void messageApi.info('스텝이 없어요');
      return;
    }
    const flat = await Promise.all(
      steps.map(async (step) => ({
        imageDataUrl: await flattenStep(step),
        caption: step.caption,
        items: step.boxes.map((box) => ({ number: box.number, description: box.description })),
      })),
    );
    const html = buildGuideHtml(title, flat);
    const result = await ipc.exportGuideHtml(title, html);
    if (result.saved) void messageApi.success(`가이드 저장: ${result.path}`);
  };

  return (
    <Drawer title="캡처 가이드 빌더" open={open} onClose={onClose} width="90%">
      {holder}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} style={{ width: 220 }} />
        <Button onClick={() => setPickerOpen(true)}>+ 캡처 추가</Button>
        <Segmented
          value={newKind}
          onChange={(value) => setNewKind(value as 'box' | 'blur')}
          options={[
            { label: '번호박스', value: 'box' },
            { label: '블러', value: 'blur' },
          ]}
        />
        <Button type="primary" onClick={() => void onSave()}>
          저장
        </Button>
        <Button onClick={() => void onExport()}>HTML 내보내기</Button>
        <Button onClick={resetEditor}>새로 만들기</Button>
        <Select
          placeholder="기존 가이드 열기"
          style={{ width: 200 }}
          value={guideId}
          onChange={(value) => void onLoad(value)}
          options={guides.map((guide) => ({ value: guide.id, label: `${guide.title} (${guide.stepCount})` }))}
        />
      </Space>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 스텝 목록 */}
        <div style={{ width: 140, flexShrink: 0 }}>
          <List
            size="small"
            bordered
            dataSource={steps}
            locale={{ emptyText: <Empty description="캡처 없음" /> }}
            renderItem={(step, index) => (
              <List.Item
                onClick={() => setStepIndex(index)}
                style={{ cursor: 'pointer', background: index === stepIndex ? '#f0f5ff' : undefined }}
                actions={[
                  <Button
                    key="d"
                    size="small"
                    type="text"
                    danger
                    onClick={(event) => {
                      event.stopPropagation();
                      setSteps((prev) => prev.filter((_, i) => i !== index));
                      setStepIndex(0);
                    }}
                  >
                    ×
                  </Button>,
                ]}
              >
                Step {index + 1}
              </List.Item>
            )}
          />
        </div>

        {/* 에디터 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {currentStep ? (
            <div
              ref={containerRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{
                position: 'relative',
                display: 'inline-block',
                userSelect: 'none',
                cursor: 'crosshair',
              }}
            >
              <img
                src={currentStep.imageDataUrl}
                alt="capture"
                style={{ maxWidth: '100%', display: 'block' }}
              />
              {currentStep.boxes.map((box) => (
                <div
                  key={box.id}
                  style={{
                    position: 'absolute',
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.w * 100}%`,
                    height: `${box.h * 100}%`,
                    border: box.kind === 'box' ? '2px solid #1677ff' : 'none',
                    backdropFilter: box.kind === 'blur' ? 'blur(6px)' : undefined,
                    background: box.kind === 'blur' ? 'rgba(0,0,0,0.04)' : undefined,
                    boxSizing: 'border-box',
                  }}
                >
                  {box.kind === 'box' && (
                    <span
                      style={{
                        position: 'absolute',
                        left: -11,
                        top: -11,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: '#1677ff',
                        color: '#fff',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {box.number}
                    </span>
                  )}
                </div>
              ))}
              {draft && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${draft.x * 100}%`,
                    top: `${draft.y * 100}%`,
                    width: `${draft.w * 100}%`,
                    height: `${draft.h * 100}%`,
                    border: '2px dashed #1677ff',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          ) : (
            <Empty description="‘+ 캡처 추가’로 시작하세요" />
          )}
        </div>

        {/* 박스 설명 패널 */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <Typography.Title level={5}>주석 ({currentStep?.boxes.length ?? 0})</Typography.Title>
          {currentStep?.boxes.map((box) => (
            <div key={box.id} style={{ marginBottom: 8 }}>
              <Space size={4} style={{ marginBottom: 2 }}>
                <span style={{ fontWeight: 600 }}>{box.kind === 'box' ? `①${box.number}` : '블러'}</span>
                <Button size="small" type="text" danger onClick={() => deleteBox(box.id)}>
                  삭제
                </Button>
              </Space>
              {box.kind === 'box' && (
                <Input.TextArea
                  value={box.description}
                  onChange={(event) => updateBox(box.id, { description: event.target.value })}
                  placeholder={`${box.number}번 설명`}
                  rows={2}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <SourcePickerModal
        open={pickerOpen}
        onPick={(sourceId) => void addCapture(sourceId)}
        onClose={() => setPickerOpen(false)}
      />
    </Drawer>
  );
};
