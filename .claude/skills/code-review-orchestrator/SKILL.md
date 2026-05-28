---
name: code-review-orchestrator
description: "코드 리뷰 오케스트레이터. 보안·성능·코드 품질·통합 QA의 4개 전문가 팀을 병렬로 실행하여 종합 리뷰 보고서를 생성. 코드 리뷰 요청, 전체 리뷰, 부분 리뷰, 보안 검토, 성능 분석, 품질 체크, 통합 검증 시 반드시 이 스킬을 사용. 후속 작업: 리뷰 결과 수정, 부분 재실행, 업데이트, 보완, 다시 실행, 이전 결과 개선 요청 시에도 반드시 이 스킬을 사용."
allowed-tools: Read,Write,Agent,Glob,Grep,TaskCreate,TaskUpdate,TaskList,TaskGet
---

# Code Review Orchestrator

4개 전문 리뷰어를 병렬로 조율하여 종합 코드 리뷰 보고서를 생성하는 통합 스킬.

## 실행 모드: 서브 에이전트 (팬아웃/팬인)

## 에이전트 구성

| 에이전트 | subagent_type | 역할 | 스킬 | 출력 |
|---------|--------------|------|------|------|
| security-reviewer | general-purpose | 보안 코드 리뷰 | code-review-security | `_workspace/02_security_review.md` |
| performance-reviewer | general-purpose | 성능 코드 리뷰 | code-review-performance | `_workspace/02_performance_review.md` |
| code-quality-reviewer | general-purpose | 코드 품질 리뷰 | code-review-quality | `_workspace/02_quality_review.md` |
| integration-qa | general-purpose | 통합 QA 리뷰 | code-review-integration | `_workspace/02_integration_review.md` |

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

기존 산출물 존재 여부를 확인하여 실행 모드를 결정한다:

1. `_workspace/` 디렉토리 존재 여부 확인
2. 실행 모드 결정:
   - **`_workspace/` 미존재** → 초기 실행. Phase 1로 진행
   - **`_workspace/` 존재 + 사용자가 부분 수정 요청** → 부분 재실행. 해당 에이전트만 재호출하고, 기존 산출물 중 수정 대상만 덮어쓴다
   - **`_workspace/` 존재 + 새 입력 제공** → 새 실행. 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동한 뒤 Phase 1 진행
3. 부분 재실행 시: 이전 산출물 경로를 에이전트 프롬프트에 포함하여, 에이전트가 기존 결과를 읽고 피드백을 반영하도록 지시

### Phase 1: 준비

1. 사용자 입력 분석:
   - 리뷰 대상 파일/디렉토리 식별
   - 리뷰 범위 확인 (전체/특정 부분)
   - 특정 관심사가 있는지 확인 (보안만, 성능만 등)
2. 작업 디렉토리에 `_workspace/` 생성
   - **초기 실행**: 새 `_workspace/` 생성
   - **새 실행**: 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동한 직후 새 `_workspace/` 재생성
3. 입력 데이터를 `_workspace/00_input/`에 저장
4. TaskCreate로 작업 목록 생성 (에이전트별 작업)

### Phase 2: 병렬 리뷰 실행

**실행 방식:** 4개 에이전트를 단일 메시지에서 동시 호출 (팬아웃)

모든 에이전트는 `model: "opus"`, `run_in_background: false`로 호출 (순차적이지만 각 에이전트 내에서 병렬 작업 수행)

| 에이전트 | 입력 | 출력 |
|---------|------|------|
| security-reviewer | 리뷰 대상 경로 + 프로젝트 컨텍스트 | `_workspace/02_security_review.md` |
| performance-reviewer | 리뷰 대상 경로 + 프로젝트 컨텍스트 | `_workspace/02_performance_review.md` |
| code-quality-reviewer | 리뷰 대상 경로 + 프로젝트 컨텍스트 | `_workspace/02_quality_review.md` |
| integration-qa | 리뷰 대상 경로 + 프로젝트 컨텍스트 | `_workspace/02_integration_review.md` |

**에이전트 호출 프롬프트 구조:**

```
당신은 {에이전트명}입니다. 이 프로젝트의 코드 리뷰를 수행해 주세요.

프로젝트 기술 스택:
- Next.js 16, React 19, TypeScript
- Prisma, Tailwind CSS
- Electron, Vitest

리뷰 대상: {사용자가 지정한 경로 또는 전체 프로젝트}

수행할 작업:
1. 대상 코드를 분석하여 {해당 분야} 문제점 식별
2. 심각도별로 분류 (Critical/High/Medium/Low)
3. 구체적인 파일 경로와 라인 번호 명시
4. 수정 제안 제공
5. 결과를 `_workspace/02_{에이전트명}_review.md`에 저장

[Phase 0에서 기존 결과가 있으면: 이전 리뷰 결과가 `_workspace_prev/02_{에이전트명}_review.md`에 있습니다. 읽어서 피드백을 반영해 주세요.]
```

### Phase 3: 종합 보고서 생성

**실행 방식:** 팬인 - 모든 리뷰 결과 수집 및 통합

1. 각 에이전트의 산출물을 Read로 수집
2. 종합 보고서 생성:
   - 요약: 발견된 총 이슈 수, 심각도별 통계
   - 각 분야별 결과 (보안/성능/품질/통합)
   - 우선순위 권장 사항
   - 전체 합격/불합격 판단
3. 최종 산출물: `_workspace/03_comprehensive_review.md`
4. 사용자에게 결과 요약 보고 (Markdown 형식)

### Phase 4: 정리

1. `_workspace/` 디렉토리 보존 (중간 산출물은 삭제하지 않음 — 사후 검증·감사 추적용)
2. 사용자에게 결과 요약 보고

## 데이터 흐름

```
[사용자 입력]
    ↓
[Phase 0: 컨텍스트 확인]
    ↓
[Phase 1: 준비 + TaskCreate]
    ↓
[Phase 2: 팬아웃 병렬 실행]
    ├─→ security-reviewer → 02_security_review.md
    ├─→ performance-reviewer → 02_performance_review.md
    ├─→ code-quality-reviewer → 02_quality_review.md
    └─→ integration-qa → 02_integration_review.md
    ↓
[Phase 3: 팬인 통합]
    ↓
[03_comprehensive_review.md]
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 에이전트 1개 실패/중지 | 1회 재시도. 재실패 시 누락 명시하고 나머지 결과로 진행 |
| 에이전트 과반 실패 | 사용자에게 알리고 진행 여부 확인 |
| 타임아웃 | 현재까지 수집된 부분 결과 사용, 미완료 에이전트 결과는 누락으로 표시 |
| 파일 읽기 오류 | 해당 파일 건너뛰고 계속, 보고서에 누락 명시 |

## 테스트 시나리오

### 정상 흐름
1. 사용자가 "전체 코드 리뷰해줘" 요청
2. Phase 0에서 `_workspace/` 미존재 확인 → 초기 실행
3. Phase 1에서 TaskCreate로 4개 작업 등록
4. Phase 2에서 4개 에이전트 병렬 실행
5. Phase 3에서 결과 수집 및 종합 보고서 생성
6. Phase 4에서 결과 요약 보고
7. 예상 결과: `_workspace/03_comprehensive_review.md` 생성

### 에러 흐름
1. 사용자가 부분 리뷰 요청
2. Phase 2에서 performance-reviewer가 에러로 중지
3. 1회 재시도 → 여전히 실패
4. Phase 3에서 security/quality/integration 결과만 수집
5. 종합 보고서에 "성능 분석 결과 누락 (에러 발생)" 명시
6. 나머지 결과로 사용자에게 보고
