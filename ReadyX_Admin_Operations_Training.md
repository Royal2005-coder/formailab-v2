---
title: "ReadyX Admin Operations Training"
subtitle: "Tài liệu nhận bàn giao, vận hành GitOps và huấn luyện end-to-end trên BA-AILab"
author: "BA-AILab • Bản dành cho Platform Administrator"
date: "Baseline xác minh ngày 14/08/2026 • Phiên bản 1.0"
lang: vi
---

# Hướng dẫn sử dụng tài liệu

Tài liệu này là bản đồ vận hành dành cho người nhận bàn giao vai trò quản trị ReadyX trên cụm BA-AILab. Nội dung được đối chiếu từ GitLab repositories, GitLab CI/CD, Argo CD Application objects và Kubernetes runtime. Mục tiêu không chỉ là biết lệnh, mà là hiểu **control plane nào sở hữu resource nào**, thay đổi đi qua đâu, cách quan sát rollout và cách dừng đúng lúc khi có sự cố.

> **Nguyên tắc đào tạo:** hiểu trước, quan sát trước, thay đổi sau. Không thử trực tiếp trên `main`, không comment `atlantis apply`, không sửa resource GitOps bằng `kubectl`, và không dùng K9s để delete/edit/scale khi chưa có change plan được duyệt.

## Kiểm soát tài liệu

| Thuộc tính | Giá trị |
|---|---|
| Phạm vi | ReadyX, GitLab CI/CD, Harbor, Argo CD, Kubernetes, Vault/VSO, Atlantis/OpenTofu |
| Runtime chính | Argo CD quản lý workload; Flux mới bootstrap |
| Infra repository | `ba-ai-lab/infra/ai-lab-v2` |
| Application repository | `ba-ai-lab/tenants/readyx` |
| Kubernetes context | `ba-ai-lab` |
| Namespace ứng dụng | `readyx` |
| Đối tượng đọc | Platform admin, application owner, người trực vận hành |
| Mức độ nhạy cảm | Nội bộ; không chứa token, password hoặc secret value |

## Kết quả học tập

Sau khi hoàn thành lộ trình, người học phải có thể:

1. Phân biệt current runtime với target architecture.
2. Chọn đúng repository và control plane cho từng loại change.
3. Giải thích được feature branch, main pipeline, Harbor release và Argo sync.
4. Quan sát rolling update bằng K9s mà không gây thay đổi ngoài ý muốn.
5. Chẩn đoán lỗi theo lớp: GitLab, build, registry, Argo, scheduler, init, readiness và hook.
6. Thực hiện rollback theo Git thay vì tạo drift trong cluster.
7. Thực hiện Terraform change qua đúng trình tự Atlantis.
8. Lập change plan, evidence package và biên bản bàn giao chuẩn.

# Tóm tắt điều hành

BA-AILab đang vận hành theo mô hình nhiều control plane. GitLab là nguồn sự thật và là nơi review change. Atlantis chạy OpenTofu/Terraform để quản lý external APIs. Argo CD đang quản lý gần như toàn bộ Kubernetes workloads. Vault Secrets Operator đưa secret từ Vault vào Kubernetes. Flux đã được cài nhưng active entrypoint đang rỗng, do đó **không được vận hành hệ thống như thể Flux đã thay Argo CD**.

![Bản đồ control plane và ownership hiện tại](diagrams/system-architecture.png){width=100%}

Luồng ứng dụng ReadyX sử dụng hai Argo CD Applications:

| Application | Nguồn Git | Trách nhiệm |
|---|---|---|
| `readyx-tenant` | `ai-lab-v2/infra/platform/manifests/tenants/readyx` | Namespace, quota, network isolation, VaultAuth và Harbor pull secret |
| `readyx-client` | `readyx/deploy` | API, web, database, Redis, MinIO, LimeSurvey, ingress, migration và bootstrap |

Điều này tạo ranh giới quản trị rõ ràng: platform team sở hữu hàng rào tenant; application team sở hữu workload nằm bên trong hàng rào đó.

# Phần I — Nền tảng kiến trúc

## Current runtime và target architecture

Repository `ai-lab-v2` chứa tài liệu thuộc nhiều giai đoạn lịch sử. README và migration plan mô tả mục tiêu chuyển sang Flux, trong khi `docs/GITOPS.md` phản ánh runtime đang chạy chính xác hơn.

### Current runtime

```text
Terraform/OpenTofu + Atlantis  → external APIs và infrastructure state
Argo CD                        → gần như toàn bộ Kubernetes workloads
Vault Secrets Operator         → secret materialization
Flux                           → bootstrap, active entrypoint chưa có workload
```

### Target architecture

```text
Terraform/OpenTofu + Atlantis  → external APIs
Flux                           → Kubernetes workloads
Vault Secrets Operator         → secret materialization
Argo CD                        → được loại bỏ sau migration có kiểm soát
```

> **Rủi ro lớn nhất trong giai đoạn chuyển tiếp:** để Argo CD và Flux cùng reconcile một resource. Mỗi resource phải có đúng một owner tại mọi thời điểm.

## Identity và đường truy cập quản trị

Chuỗi truy cập hiện tại:

```text
Headscale/Tailscale VPN
→ Atlas login qua Keycloak
→ Atlas credential cho kubectl
→ Kubeconfig context ba-ai-lab
→ Kubernetes RBAC theo Keycloak groups
```

Identity đã xác minh:

```text
Keycloak: tlc03@tlc.partner
Groups: platform-admins, k8s-admins, ...
```

GitLab sử dụng hai cơ chế riêng:

| Mục đích | Cơ chế |
|---|---|
| Web login | Keycloak SSO |
| `glab` REST API | Personal Access Token trong Windows keyring |
| Git clone/fetch/push | SSH key qua GitLab Shell port `2222` |

SSH endpoint chuẩn:

```text
Host: gitlab.ba-ailab.com
Port: 2222
User: git
```

Port `22` là SSH của host, không phải GitLab Shell. Dùng sai port sẽ dẫn tới `Permission denied` dù public key đã được thêm đúng tài khoản GitLab.

## Ownership boundary

| Resource | Owner | Source of truth | Không được làm |
|---|---|---|---|
| GitLab projects/groups/variables | Terraform + Atlantis | `infra/terraform/live/` | Sửa tay nếu resource đã được Terraform quản lý |
| Harbor projects/robots | Terraform + Atlantis | Infra repo | Tạo credential ngoài state mà không ghi nhận |
| Vault policies/roles | Terraform + Atlantis | Infra repo | Sửa policy trực tiếp rồi bỏ quên drift |
| Keycloak groups/config | Terraform + Atlantis | Infra repo | Thay đổi tay không có MR |
| Headscale/Tailscale resources | Terraform + Atlantis | Infra repo | Dùng local apply |
| Namespace/quota/network policy | Argo CD | Platform manifests | `kubectl apply/edit` làm trạng thái cuối |
| ReadyX Deployments/Services | Argo CD | `readyx/deploy` | `kubectl rollout undo` làm rollback lâu dài |
| Secret values | Vault + VSO | Vault | Commit secret hoặc sửa Secret trực tiếp |
| Container images | GitLab CI + Harbor | Commit SHA | Dùng tag không truy ngược được nếu tránh được |
| Terraform state | GitLab HTTP backend | State API | Đổi project/state name tùy tiện |

![Thay đổi nào đi qua control plane nào](diagrams/change-routing.png){width=100%}

## Hai working copy quản trị

```text
workspace-infra/
  origin → ssh://git@gitlab.ba-ailab.com:2222/ba-ai-lab/infra/ai-lab-v2.git

workspace-readyx/
  origin → ssh://git@gitlab.ba-ailab.com:2222/ba-ai-lab/tenants/readyx.git
```

Quy tắc trước mọi phiên làm việc:

```powershell
git status --short --branch
git fetch --prune
git log --oneline -10
git branch --show-current
```

Không bắt đầu change khi working tree không sạch hoặc chưa hiểu các thay đổi đang tồn tại.

# Phần II — ReadyX từ code đến production

## Baseline đã xác minh

### Git

```text
ReadyX main: 5f6910c  fix(ingress): use Caddy wildcard for LimeSurvey admin [skip ci]
Infra main:  f651bbd  feat(spire): Vault-backed secrets for the soil-moisture crawler
```

### Deployment

```text
readyx-api image: harbor.ba-ailab.com/mip/readyx-api:bf27bc05
readyx-web image: harbor.ba-ailab.com/mip/readyx-web:bf27bc05
availableReplicas: 1
```

### Pods

```text
readyx-api-755cdbf7cc-xqc2v
UID: ca7789e7-bc6f-452d-883c-cb4952587acc

readyx-web-75649dc8c7-xfs44
UID: 5470efc0-83e0-4038-b764-66c152caa35f
```

### Vì sao Git HEAD và image tag khác nhau?

```text
bf27bc05  → commit code được build thành image
914044f   → automation cập nhật deploy tags thành bf27bc05
5f6910c   → ingress change có [skip ci], không build image mới
```

Argo revision đại diện cho desired-state commit. Image tag đại diện cho build commit. Hai giá trị không bắt buộc giống nhau.

## Sơ đồ CI/CD end-to-end

![Luồng CI/CD ReadyX](diagrams/readyx-cicd.png){width=100%}

Luồng logic:

```text
Feature branch
→ Draft Merge Request
→ GitLab test jobs
→ review và phê duyệt merge
→ main pipeline
→ Kaniko build images
→ push Harbor với short SHA
→ release sửa deploy/kustomization.yaml
→ automation commit [skip ci]
→ Argo CD phát hiện desired state mới
→ Kubernetes rolling update
→ Prisma migration init container
→ API/Web readiness
→ Argo PostSync bootstrap Job
→ Synced / Healthy
```

## Feature branch và Draft MR

Feature branch chưa được `readyx-client` theo dõi, vì Argo CD target `main`. Đây là vùng training an toàn nhất.

Path rules hiện tại:

| Thay đổi | Job dự kiến |
|---|---|
| `apps/api/**` | `test-api` |
| `apps/web/**` | `test-web` |
| `packages/**` | Cả job liên quan theo rule |
| `pnpm-lock.yaml` | API và web checks |
| Chỉ `doc/**` | Có thể không có job |
| Feature branch bất kỳ | Không có production image builds |

`test-api` hiện chủ yếu cài dependency, generate Prisma Client và compile NestJS. `test-web` chạy Next.js production build. Tên “test” không đồng nghĩa hệ thống đã có đầy đủ unit, integration, lint, security và deployment validation.

### Tiêu chí an toàn cấp 1

- [ ] Branch không phải `main`.
- [ ] MR ở trạng thái Draft.
- [ ] Không sửa `deploy/`.
- [ ] Không có `build-*` jobs.
- [ ] Không có `release` job.
- [ ] Harbor không có tag mới từ branch.
- [ ] Argo revision không đổi.
- [ ] Pod UID và image tag không đổi.

## Main pipeline

Khi change vào `main`, bốn build jobs chạy:

```text
build-api
build-api-migrate
build-web
build-postgres
```

Kaniko build và push:

```text
harbor.ba-ailab.com/mip/readyx-api:<short-sha>
harbor.ba-ailab.com/mip/readyx-api-migrate:<short-sha>
harbor.ba-ailab.com/mip/readyx-web:<short-sha>
harbor.ba-ailab.com/mip/readyx-postgres-cnpg:16.4
```

API, migration và web dùng short SHA. PostgreSQL dùng tag `16.4` nhưng tag này vẫn có thể bị ghi đè, vì vậy không thực sự immutable. MinIO dùng `latest`, cũng là mutable.

> **Điểm kiểm soát:** một main commit nhỏ vẫn có thể build lại cả bốn images. Cần xem pipeline graph, digest và logs trước khi kết luận “chỉ API thay đổi”.

## Release commit loop

Release job đợi đủ bốn image builds rồi thực hiện tương đương:

```bash
TAG="$CI_COMMIT_SHORT_SHA"
yq -i '.images[].newTag = strenv(TAG)' deploy/kustomization.yaml
```

Sau đó automation push:

```text
ci: deploy <short-sha> [skip ci]
```

`[skip ci]` ngăn release commit kích hoạt một pipeline mới rồi tạo vòng lặp vô hạn.

### Hai commits cho một release

```text
Application commit
→ build artifacts

Release commit
→ cập nhật desired image tags
→ Argo CD deploy
```

Khi audit incident, phải tìm cả application commit lẫn release commit.

## Rủi ro của deploy-only change

Nếu một commit thay đổi trực tiếp `deploy/` trên `main` mà không dùng `[skip ci]`:

```text
Argo có thể sync manifest commit ngay
→ pipeline tiếp tục build bốn images
→ release commit đổi image tags
→ Argo sync lần hai
```

Điều này có thể tạo hai lần reconcile hoặc rollout. Deploy-only change cần MR, render validation và change window rõ ràng.

## Argo CD readyx-client

Desired source:

```yaml
repoURL: https://gitlab.ba-ailab.com/ba-ai-lab/tenants/readyx.git
targetRevision: main
path: deploy
destination:
  namespace: readyx
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

Ý nghĩa:

| Thuộc tính | Hành vi |
|---|---|
| Automated | Git đổi thì tự reconcile |
| Prune | Git xóa resource thì cluster có thể xóa resource |
| SelfHeal | Manual drift có thể bị đưa trở lại trạng thái Git |
| CreateNamespace | Có thể tạo namespace nếu thiếu, nhưng tenant app mới là owner chuẩn của boundary |

Không dùng `kubectl edit`, `kubectl apply`, `kubectl scale` hoặc K9s edit làm phương pháp deploy lâu dài.

## Kubernetes rolling update

API và web không khai báo strategy riêng, nên dùng mặc định `RollingUpdate`.

```text
Deployment template đổi
→ ReplicaSet mới
→ pod mới Scheduled
→ pull image
→ init containers
→ application container
→ readiness probe
→ pod mới Ready
→ pod cũ Terminating
→ ReplicaSet cũ scale về 0
```

Với một replica, rollout phụ thuộc việc quota và scheduler cho phép pod cũ và pod mới tồn tại đồng thời. Nếu quota chặn surge pod, rollout có thể đứng ở Pending.

![Bản đồ quan sát rolling update trong K9s](diagrams/rollout-observation.png){width=100%}

## Prisma migration init container

Mỗi API pod mới chạy:

```text
prisma migrate deploy
```

Trình tự:

```text
Pod Scheduled
→ db-migrate init container
→ lấy DATABASE_URL từ CNPG secret
→ kết nối PostgreSQL
→ chạy pending migrations
→ init thành công
→ API container start
→ /api/health đạt readiness
```

Nếu migration lỗi, API container không start. Pod thường hiển thị `Init:Error` hoặc `Init:CrashLoopBackOff`.

### Thu thập evidence trước khi xử lý

```powershell
kubectl describe pod <pod> -n readyx
kubectl logs <pod> -n readyx -c db-migrate
kubectl get events -n readyx --sort-by=.lastTimestamp
kubectl get cluster readyx-db -n readyx
```

Không xóa pod cũ nếu nó vẫn đang phục vụ. Không tự chỉnh migration table hoặc chạy SQL rollback chưa được duyệt.

## Readiness và liveness

| Component | Readiness/Liveness |
|---|---|
| API | `/api/health` |
| Web | `/` |

`Running` không có nghĩa `Ready`.

```text
Running + READY 0/1
→ process đã start nhưng chưa nhận traffic

Liveness thất bại
→ kubelet restart container
→ RESTARTS tăng
```

Khi rollout, chỉ xác nhận thành công sau khi readiness đạt, replicas available đúng, logs không có lỗi và Argo trở lại `Synced / Healthy`.

## PostSync bootstrap Job

`readyx-bootstrap` là Argo CD PostSync hook. Nó thực hiện các tác vụ có thay đổi dữ liệu:

```text
Enable LimeSurvey RemoteControl2
Seed Prisma data
Author sample LimeSurvey content
```

Hook policy:

```text
BeforeHookCreation
HookSucceeded
```

Job thành công có thể được dọn. Job thất bại được giữ lại để điều tra. Deployment có thể chạy nhưng toàn bộ Argo operation vẫn báo Failed nếu PostSync hook lỗi.

## Secrets và configuration

Runtime secret flow:

```text
Vault KV v2
→ VaultStaticSecret readyx-app
→ Vault Secrets Operator
→ Kubernetes Secret readyx-app
→ Pod environment
```

Database connection:

```text
CloudNativePG
→ Secret readyx-db-app
→ key uri
→ DATABASE_URL
```

Image pull:

```text
Vault shared Harbor credential
→ readyx-harbor-pull
→ imagePullSecret
```

Secret update không đảm bảo process đang chạy tự nạp environment mới. Cần xác minh phương thức consume secret và thực hiện rollout có kiểm soát nếu cần.

## Stateful services

| Thành phần | Storage/đặc điểm | Rủi ro chính |
|---|---|---|
| CNPG PostgreSQL | 1 instance, Longhorn PVC | Chưa HA; migration coupling |
| LimeSurvey MySQL | 1 Deployment, PVC | Backup/restore cần runbook |
| MinIO | 1 Deployment, `local-path` PVC | Phụ thuộc node; nguy cơ mất dữ liệu khi node lỗi |
| Redis | Ephemeral | Mất cache/state khi restart |

Không coi application rollback là database rollback. Prisma migrations được vận hành theo hướng forward-only; lỗi schema cần compensating migration.

# Phần III — Platform, Terraform và Atlantis

## Argo CD app-of-apps

`infra/platform/bootstrap/app-of-apps.yaml` tạo `platform-root`, theo dõi:

```text
ai-lab-v2/main
path: infra/platform/apps
```

Từ đó Argo CD tạo và reconcile các Applications như Atlantis, GitLab, Vault, ReadyX tenant và ReadyX client.

```text
platform-root
→ infra/platform/apps/*.yaml
→ child Argo Applications
→ Helm charts hoặc Kustomize manifests
→ cluster resources
```

Vì `prune` và `selfHeal` được bật, việc xóa hoặc sửa app definition trong infra repo có blast radius lớn.

## Atlantis deployment

Atlantis bản runtime:

```text
Helm chart: 6.6.0
Atlantis image: v0.44.0
Namespace: atlantis
Owner: Argo CD
```

Argo CD lấy chart từ upstream và values từ:

```text
infra/platform/helm-values/atlantis.yaml
```

Atlantis itself là workload Kubernetes do Argo quản lý; Atlantis lại quản lý external resources qua Terraform. Đây là hai lớp ownership khác nhau.

## Terraform live roots và state

Các live roots chính nằm dưới:

```text
infra/terraform/live/
```

Ví dụ:

```text
gitlab
gitlab-runner
gitlab-storage
harbor
headscale
keycloak
minio
products
tailscale
vault
tenants/readyx
```

Mỗi root khai báo HTTP backend:

```hcl
terraform {
  backend "http" {}
}
```

Atlantis inject backend address, lock endpoints và credentials. State identity gắn với Atlantis project name; đổi tên project có thể khiến OpenTofu nhìn thấy một state khác.

## Atlantis MR workflow chuẩn

```text
1. Tạo feature branch
2. Thay đổi Terraform trong đúng live root
3. Push branch
4. Mở MR
5. GitLab webhook gọi Atlantis
6. Atlantis match project và autoplan
7. Vault Kubernetes auth cấp credentials
8. tofu init
9. tofu validate
10. tofu plan
11. Plan được comment vào MR
12. Admin review resource addresses và actions
13. MR được approve và vẫn mergeable
14. Comment atlantis apply
15. Atlantis dùng saved plan để apply
16. Verify external system và state
17. Merge MR
```

Trình tự chính xác:

```text
plan → review → approve → atlantis apply → verify → merge
```

Không phải `plan → merge → automatic apply`. Cấu hình hiện tại yêu cầu MR còn mở, approved và mergeable khi apply.

## Đọc Terraform plan như admin

Mọi plan phải được phân loại:

| Ký hiệu | Ý nghĩa | Hành động admin |
|---|---|---|
| `+ create` | Tạo resource | Xác minh name, owner, policy và quota |
| `~ update in-place` | Sửa tại chỗ | Kiểm tra field thay đổi và side effect |
| `-/+ replace` | Xóa rồi tạo lại | Coi là high risk; xem downtime/data loss |
| `- destroy` | Xóa resource | Không apply nếu chưa có explicit approval |
| `<= read` | Data source | Xem dependency và credential scope |

Checklist plan:

- [ ] Đúng project và đúng state.
- [ ] Không có resource ngoài phạm vi MR.
- [ ] Không có destroy/replace bất ngờ.
- [ ] Secret values không xuất hiện trong log.
- [ ] Provider target đúng environment.
- [ ] Dependency và blast radius được mô tả.
- [ ] Rollback hoặc compensating change đã chuẩn bị.
- [ ] Approval đúng người có trách nhiệm.

## Flux migration boundary

Flux bootstrap chain đã tồn tại, nhưng active entrypoint chứa `resources: []`. Deferred manifests không phải runtime hiện tại.

Quy trình migrate một workload:

```text
Chuẩn bị Flux source
→ render và validate
→ xác định toàn bộ resources Argo đang sở hữu
→ dừng Argo ownership an toàn
→ xác nhận Argo không prune nhầm
→ kích hoạt Flux ownership
→ kiểm tra drift và health
→ ghi nhận rollback
```

Không copy resource vào `fleet/` rồi merge khi Argo Application tương ứng vẫn hoạt động.

# Phần IV — Vận hành hằng ngày

## Daily admin checklist

### Đầu ca

- [ ] Kết nối đúng Headscale control plane.
- [ ] `atlas status` đúng identity và groups.
- [ ] `kubectl config current-context` trả `ba-ai-lab`.
- [ ] Argo Applications quan trọng không Degraded/Missing.
- [ ] ReadyX deployments có đủ available replicas.
- [ ] Không có pod restart tăng bất thường.
- [ ] Không có MR infra đang chờ apply nhưng bị bỏ quên.
- [ ] Không có main pipeline ReadyX đang chạy hoặc failed chưa xử lý.

### Cuối ca

- [ ] Ghi nhận active incidents và change windows.
- [ ] Liên kết commit, pipeline, release commit và Argo revision.
- [ ] Không để local branch chứa thay đổi chưa ghi nhận.
- [ ] Đóng port-forward hoặc shell session.
- [ ] Không lưu token/secret trong terminal transcript.

## Pre-change checklist

```text
Change ticket/MR
→ owner
→ scope
→ blast radius
→ validation
→ observability
→ rollback
→ approval
→ maintenance window
```

- [ ] Working tree sạch.
- [ ] Đã fetch `origin/main` mới nhất.
- [ ] Change nằm đúng repository.
- [ ] Control plane đúng với ownership matrix.
- [ ] Pipeline rules đã được dự đoán.
- [ ] K9s baseline đã ghi nhận.
- [ ] Có rollback commit/tag.
- [ ] Không có concurrent release gây race.
- [ ] On-call biết change đang diễn ra.

## K9s observation mode

Khởi động:

```powershell
$env:KUBECONFIG="$HOME\.kube\configs\ailab-oidc.yaml"
$env:ATLAS_CONFIG_DIR="$HOME\.config\atlas-ailab"
k9s --context ba-ai-lab --namespace readyx
```

Views hữu ích:

| Lệnh K9s | Mục đích |
|---|---|
| `:pods` | Pod readiness, restarts, age |
| `:deploy` | Desired/available replicas |
| `:rs` | ReplicaSet cũ và mới |
| `:jobs` | Migration/bootstrap hooks |
| `:events` | Scheduler, image pull, probe, volume errors |
| `l` | Logs của container đang chọn |
| `/` | Lọc resource |
| `Esc` | Quay lại |

Trong training không dùng delete, edit, scale hoặc shell. K9s là kính quan sát, không phải nút deploy.

## Argo status interpretation

| Sync | Health | Diễn giải |
|---|---|---|
| Synced | Healthy | Git và cluster khớp, workload khỏe |
| OutOfSync | Healthy | Runtime còn hoạt động nhưng khác desired state |
| Synced | Progressing | Apply xong, rollout/hook chưa hoàn tất |
| Synced | Degraded | Desired state đã áp dụng nhưng resource lỗi |
| OutOfSync | Missing | Resource mong muốn chưa tồn tại |
| Unknown | Unknown | Argo không đọc hoặc compare được |

Không Force Sync hoặc Prune trước khi hiểu resource nào sẽ bị tác động.

## Incident triage theo lớp

### Lớp GitLab

Triệu chứng: pipeline không xuất hiện, job bị skipped, release không chạy.

Kiểm tra: pipeline source, branch, path rules, protected variables, runner availability và commit `[skip ci]`.

### Lớp build/Harbor

Triệu chứng: Kaniko failed, image tag thiếu, ImagePullBackOff.

Kiểm tra: build logs, registry path, tag, pull secret, TLS và image existence.

### Lớp Argo CD

Triệu chứng: OutOfSync, Degraded, hook failed.

Kiểm tra: desired revision, resource diff, operation history, sync result và hook logs.

### Lớp scheduler/quota

Triệu chứng: pod Pending.

Kiểm tra:

```powershell
kubectl describe pod <pod> -n readyx
kubectl get events -n readyx --sort-by=.lastTimestamp
kubectl get resourcequota,limitrange -n readyx
kubectl get pvc -n readyx
```

### Lớp init/migration

Triệu chứng: `Init:Error`, `Init:CrashLoopBackOff`.

Kiểm tra init logs, CNPG health, database secret existence và migration compatibility.

### Lớp readiness

Triệu chứng: Running nhưng `0/1`, Service không route traffic.

Kiểm tra probe endpoint, app logs, dependencies và environment configuration.

### Lớp PostSync

Triệu chứng: workloads chạy nhưng Argo operation Failed.

Kiểm tra `readyx-bootstrap`, LimeSurvey connectivity, seed idempotency và failed Job logs.

## Rollback runbook

### Application rollback

```text
Xác định bad commit
→ tạo revert branch
→ MR review
→ merge
→ CI build image từ revert code
→ release cập nhật tag
→ Argo sync
→ verify health
```

### Manifest-only rollback

```text
Chọn known-good immutable image tag
→ sửa Kustomize qua MR
→ merge
→ Argo sync
→ verify
```

### Terraform rollback

```text
Revert Terraform code
→ Atlantis plan
→ review
→ approve
→ atlantis apply
→ verify state và external resource
→ merge
```

### Database rollback

Không tự động đi cùng app rollback. Dùng compensating migration hoặc restore procedure đã được phê duyệt. Luôn đánh giá data loss trước.

# Phần V — Chương trình training thực hành

## Cấp 0 — Observation only

Mục tiêu: hiểu baseline mà không tạo change.

Thực hành:

1. Mở K9s namespace `readyx`.
2. Ghi pod name, UID, age, image và restart count.
3. Xem Deployments, ReplicaSets, Jobs và Events.
4. Xem Argo `readyx-client` revision và health.
5. Xem GitLab pipeline history nhưng không retry/run.
6. Đối chiếu Git `main`, release commit và image tag.

Tiêu chí hoàn thành:

- [ ] Giải thích được vì sao `5f6910c` khác `bf27bc05`.
- [ ] Xác định được ReplicaSet hiện tại.
- [ ] Không có cluster mutation.
- [ ] Không có pipeline hoặc branch mới.

## Cấp 1 — Feature branch CI observation

Mục tiêu: chứng minh branch pipeline không rollout production.

Change đề xuất: thêm comment vô hại dưới `apps/api/`; không đổi behavior và không chạm `deploy/`.

```text
Tạo branch training/tlc03-ci-observation
→ thay đổi comment
→ local diff review
→ commit
→ push
→ Draft MR
→ quan sát test-api
→ so sánh K9s baseline
→ không merge
→ đóng MR và xóa branch
```

Stop conditions:

- `build-*` xuất hiện trên feature branch.
- `release` xuất hiện.
- Protected variables bị expose.
- Argo revision thay đổi.
- Pod UID hoặc image đổi không có change khác được biết.

## Cấp 2 — Local manifest validation

Mục tiêu: học desired state mà không push hoặc apply.

```powershell
kubectl kustomize deploy
```

Kiểm tra:

- Resource names và namespace.
- Image substitutions.
- Secret references nhưng không đọc secret values.
- Probes, resources, PVCs và hooks.
- Không có cluster-scoped resource ngoài dự kiến.

Không dùng output này với `kubectl apply`.

## Cấp 3 — Sandbox GitOps

Mục tiêu: quan sát rollout thật nhưng không dùng namespace production.

Yêu cầu trước lab:

- Namespace sandbox riêng.
- Argo Project/App sandbox riêng.
- Image repository/tag riêng.
- Không dùng production database hoặc Vault path.
- Quota và network policy sandbox.
- Cleanup plan được duyệt.

Lab:

```text
Sandbox branch/repo path
→ CI build sandbox image
→ Argo sandbox sync
→ K9s quan sát ReplicaSet/pod
→ health test
→ Git revert
→ xác nhận rollback
→ cleanup qua Git
```

## Cấp 4 — Production rollout có phê duyệt

Chỉ thực hiện khi đã hoàn thành cấp 0–3.

Gates:

- [ ] Business owner duyệt.
- [ ] Technical review hoàn tất.
- [ ] Pipeline checks đạt.
- [ ] Database migration được review riêng.
- [ ] Backup/restore posture được xác nhận.
- [ ] K9s và Argo đang mở để quan sát.
- [ ] Rollback tag/commit đã ghi nhận.
- [ ] Không có concurrent main pipeline.

## Cấp 5 — Atlantis training

Chọn một sandbox resource có blast radius thấp. Không bắt đầu bằng Keycloak, Headscale, Vault policy production hoặc shared networking.

```text
Terraform branch
→ Draft MR
→ Atlantis plan
→ đọc plan line-by-line
→ không apply trong vòng đầu
→ review state và provider
→ apply chỉ sau explicit approval
→ verify
→ merge
```

Tiêu chí hoàn thành: người học giải thích được resource address, backend state, provider target, plan action, rollback và tại sao apply diễn ra trước merge.

# Phần VI — Nhận bàn giao và quản trị dài hạn

## Known risks và technical debt

| Rủi ro | Tác động | Ưu tiên xử lý |
|---|---|---|
| `GITOPS_TOKEN` chưa protected | Có thể push release ngoài boundary mong muốn | Cao |
| Harbor variables chưa protected | Credential exposure risk | Cao |
| Main không bắt buộc pipeline xanh | Merge change chưa được validate | Cao |
| ReadyX lịch sử ít MR | Thiếu review/audit evidence | Cao |
| Deploy-only changes bỏ qua test | Manifest lỗi tới main | Cao |
| Release race giữa main pipelines | Tag commit sai thứ tự | Cao |
| PostgreSQL `16.4` mutable | Khó truy vết artifact | Trung bình |
| MinIO dùng `latest` | Rollout không xác định | Cao |
| Kaniko `--skip-tls-verify` | Giảm đảm bảo transport | Cao |
| Single replicas | Downtime khi lỗi/rollout | Cao |
| Migration chặn API startup | Release coupling | Cao |
| MinIO `local-path` | Node-loss/data-loss risk | Cao |
| `vault-ci` thiếu Atlantis project | Change có thể không autoplan | Cao |
| Flux/Argo chuyển tiếp | Dual ownership risk | Cao |
| Bootstrap secrets có ngoại lệ | DR phụ thuộc knowledge ngoài Vault | Trung bình |

## Handover evidence package

Người bàn giao cần cung cấp hoặc xác nhận:

- [ ] Danh sách service owners và on-call contacts.
- [ ] Sơ đồ DNS, public ingress và GitLab Shell port.
- [ ] GitLab protected branch và approval rules.
- [ ] CI variable owners, scopes, expiry và rotation process.
- [ ] Harbor retention, scanning và immutable-tag policy.
- [ ] Vault paths, auth roles và rotation runbook.
- [ ] CNPG backup, restore test và RPO/RTO.
- [ ] LimeSurvey MySQL backup/restore.
- [ ] MinIO data recovery plan.
- [ ] Argo admin access và break-glass procedure.
- [ ] Atlantis webhook, repo config và state recovery.
- [ ] Headscale ACL ownership và subnet router runbook.
- [ ] Flux migration plan và resource-by-resource ownership ledger.
- [ ] Incident history và known recurring failures.
- [ ] Maintenance windows và stakeholder notification template.

## Change record mẫu

| Trường | Nội dung cần ghi |
|---|---|
| Change ID | Ticket/MR link |
| Owner | Người thực hiện và reviewer |
| Scope | Resource, namespace, service |
| Source commit | Application/infra SHA |
| Pipeline | Pipeline ID và kết quả |
| Artifact | Harbor repository, tag và digest |
| GitOps revision | Argo desired revision |
| Runtime evidence | Pod UID, ReplicaSet, events, health |
| Data impact | Migration/seed/secret rotation |
| Rollback | Commit/tag/runbook |
| Outcome | Success, partial, rollback hoặc follow-up |

## Command reference — read-only

### Atlas và context

```powershell
atlas status
atlas refresh
kubectl config current-context
```

### ReadyX baseline

```powershell
kubectl get deploy -n readyx
kubectl get pods -n readyx -o wide
kubectl get rs -n readyx
kubectl get jobs -n readyx
kubectl get events -n readyx --sort-by=.lastTimestamp
```

### Images và rollout

```powershell
kubectl get deploy readyx-api readyx-web -n readyx `
  -o custom-columns='NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image,AVAILABLE:.status.availableReplicas'
```

### Argo Application

```powershell
kubectl get application readyx-client -n argocd
kubectl describe application readyx-client -n argocd
```

### Git baseline

```powershell
git status --short --branch
git log --oneline -10
git remote -v
git diff origin/main...HEAD
```

## Command blacklist trong training

Không chạy khi chưa có explicit change approval:

```text
kubectl apply
kubectl edit
kubectl delete
kubectl scale
kubectl rollout undo
argocd app sync --force
terraform apply
tofu apply
atlantis apply
git push origin main
git push --force
```

# Phụ lục A — Glossary

| Thuật ngữ | Ý nghĩa trong hệ thống |
|---|---|
| Desired state | Trạng thái được khai báo trong Git |
| Reconcile | Controller đưa runtime về desired state |
| Drift | Runtime khác Git hoặc Terraform state/config |
| Argo Application | Đơn vị GitOps theo dõi repo/path và destination |
| Prune | Xóa runtime resource không còn trong desired state |
| Self-heal | Tự sửa manual drift |
| ReplicaSet | Tập pod của một Deployment template revision |
| Readiness | Điều kiện pod được nhận traffic |
| Liveness | Điều kiện container còn khỏe để không bị restart |
| Init container | Container phải hoàn thành trước app container |
| PostSync hook | Job chạy sau Argo sync phase |
| VSO | Vault Secrets Operator |
| Live root | Terraform directory có state độc lập |
| Atlantis project | Mapping directory/workflow/state cho plan/apply |
| Immutable artifact | Artifact không đổi nội dung dưới cùng identifier |
| RPO/RTO | Mục tiêu mất dữ liệu tối đa/thời gian phục hồi |

# Phụ lục B — Sources of truth

Tài liệu và source paths quan trọng:

```text
ai-lab-v2/docs/GITOPS.md
ai-lab-v2/docs/OWNERSHIP-BOUNDARY.md
ai-lab-v2/docs/MIGRATION-PLAN.md
ai-lab-v2/infra/atlantis.yaml
ai-lab-v2/infra/platform/bootstrap/app-of-apps.yaml
ai-lab-v2/infra/platform/apps/atlantis.yaml
ai-lab-v2/infra/platform/apps/readyx-tenant.yaml
ai-lab-v2/infra/platform/apps/readyx-client.yaml
ai-lab-v2/infra/platform/manifests/tenants/readyx/
ai-lab-v2/infra/platform/helm-values/atlantis.yaml
readyx/.gitlab-ci.yml
readyx/deploy/
readyx/doc/KUBERNETES_DEVELOPMENT_GUIDE.md
readyx/infra/docker/
```

Runtime luôn phải được đối chiếu với Git và controller status. Khi tài liệu mâu thuẫn, ưu tiên source đang được controller theo dõi và evidence runtime, sau đó cập nhật tài liệu bằng MR.

# Kết luận

Mô hình vận hành chuẩn của ReadyX không phải “push code rồi nhìn pod”. Đó là một chuỗi có kiểm soát:

```text
Identity đúng
→ change đúng ownership
→ branch và review
→ pipeline phù hợp
→ artifact truy vết được
→ desired state commit
→ Argo reconcile
→ rollout quan sát được
→ migration/hook kiểm chứng
→ health và audit evidence
→ rollback sẵn sàng
```

Platform admin giỏi không phải người thao tác nhanh nhất, mà là người luôn biết **ai đang sở hữu resource, change đến từ commit nào, controller nào sẽ phản ứng, dữ liệu nào bị tác động, dấu hiệu thành công là gì và rollback bằng nguồn sự thật nào**.
