# One-click deploy — Provisioning Advisor

Three ways to host the advisor, easiest first. All use the customer's own Azure
subscription; the app reads metrics with its **managed identity**, so no secrets
are ever stored.

---

## 1. Deploy to Azure (one click)

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2FImrandiva%2Fazure-files-advisor-deploy-dev%2Fmain%2Finfra%2Fazuredeploy.json)

This opens the Azure Portal with a prefilled form. The customer picks a resource
group + region, clicks **Review + create**, and ~2 minutes later gets a running
Container App (scale-to-zero) at a public HTTPS URL.

> **Prerequisites for the button to work anonymously:**
> 1. This repo must be **public** (the portal fetches `infra/azuredeploy.json`
>    from the raw URL), **or** host the template somewhere publicly reachable.
> 2. The container image must be **public**. The `build-advisor-image` workflow
>    publishes it to GHCR; after the first run, set the GHCR package visibility
>    to **Public** once (Packages → the package → Package settings → Change
>    visibility). The template's default `image` parameter points at it.

### After deploy — grant read access (the one manual step)

The app's managed identity needs **Monitoring Reader** on whatever the customer
will query. This can't be pre-baked because it grants access into *their*
subscriptions. Copy `principalId` from the deployment outputs, then:

```bash
az role assignment create \
  --assignee-object-id <principalId> --assignee-principal-type ServicePrincipal \
  --role "Monitoring Reader" \
  --scope /subscriptions/<sub-id>
```

---

## 2. One command (CLI, builds from source — no image or public repo needed)

```bash
deploy/deploy-advisor-containerapp.sh <rg> <app-name> <region> /subscriptions/<sub-id>
```

`az containerapp up --source ./advisor` builds the image in the cloud, so the
customer needs neither Docker nor a registry. The optional last argument grants
Monitoring Reader automatically.

---

## 3. Docker (run anywhere)

```bash
docker build -t advisor ./advisor
docker run -p 8080:8080 advisor
# open http://localhost:8080  (uses your `az login` locally)
```

---

## Why Azure Container Apps?

- **Scale-to-zero** → ≈ €0 when idle; ideal for an intermittently-used internal tool.
- **Built-in HTTPS + ingress** → no cert or load-balancer setup.
- **Managed identity** → the app reads Azure Monitor as itself; no secrets.

App Service is also scripted (`deploy/deploy-advisor-appservice.*`) if the
customer prefers always-on with a custom domain.
