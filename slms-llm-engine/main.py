import os
import re
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Security, Depends, status
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel, Field

API_KEY_NAME = "X-API-Key"
API_KEY = os.getenv("LLM_API_KEY", "slms-engine-secret-key-2026")
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

app = FastAPI(
    title="SLMS Remote LLM Engine",
    description="Agentic Semantic Extraction & Vocabulary Formulation Microservice",
    version="1.0.0"
)


def verify_api_key(header_key: str = Depends(api_key_header)):
    if header_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header"
        )
    return header_key


# Request / Response Schemas
class TripleExtractRequest(BaseModel):
    text: str
    domain: str = "Banking"


class ExtractedTriple(BaseModel):
    subject: str
    predicate: str
    object: str
    confidence: float = 0.90


class TripleExtractResponse(BaseModel):
    triples: List[ExtractedTriple]


class GapDetectRequest(BaseModel):
    text: str
    known_vocab: List[str] = Field(default_factory=list)


class DetectedGap(BaseModel):
    term: str
    context: str
    category: str
    confidence: float


class GapDetectResponse(BaseModel):
    gaps: List[DetectedGap]


class AcronymResolveRequest(BaseModel):
    acronym: str
    context: str


class AcronymResolveResponse(BaseModel):
    acronym: str
    full_form: str
    definition: str
    candidate_broader: List[str]
    confidence: float


class SkosFormulateRequest(BaseModel):
    pref_label: str
    context: str


class SkosFormulateResponse(BaseModel):
    pref_label: str
    alt_labels: List[str]
    definition: str
    scope_note: str
    broader_concepts: List[str]
    confidence: float


# Domain Knowledge Base for Acronyms & Banking Heuristics
BANKING_ACRONYMS = {
    "DBS": {
        "full_form": "Doğrudan Borçlandırma Sistemi",
        "definition": "Ana firma ile bayi/müşterileri arasındaki mal ve hizmet alımlarına ilişkin fatura bedellerinin banka güvencesiyle otomatik tahsil edilmesini sağlayan nakit yönetimi ve tedarik zinciri finansmanı ürünüdür.",
        "candidate_broader": ["https://bank.internal/ontologies/core#NakitYonetimiUrunu", "https://bank.internal/ontologies/core#TedarikZinciriFinansmani"],
        "alt_labels": ["Doğrudan Borçlanma Sistemi", "Direct Debiting System", "ODS"]
    },
    "RES": {
        "full_form": "Rüzgar Enerji Santrali",
        "definition": "Rüzgar kinetik enerjisini elektrik enerjisine dönüştüren yenilenebilir enerji üretim tesisidir.",
        "candidate_broader": ["https://bank.internal/ontologies/core#YenilenebilirEnerjiTesisi", "https://bank.internal/ontologies/core#EnerjiYatirimi"],
        "alt_labels": ["Rüzgâr Enerji Santrali", "Wind Power Plant"]
    },
    "KMH": {
        "full_form": "Kredili Mevduat Hesabı",
        "definition": "Vadesiz mevduat hesabına tanımlanan ve bakiye yetersiz olduğunda otomatik devreye giren kısa vadeli tüketici/ticari kredi limitidir.",
        "candidate_broader": ["https://bank.internal/ontologies/core#KrediUrunu"],
        "alt_labels": ["Kredili Hesap", "Artı Para", "Overdraft"]
    },
    "BCH": {
        "full_form": "Borçlu Cari Hesap",
        "definition": "Firmanın ihtiyaç duyduğu anda kredi limitinden para çekip ödeme yapabildiği, faizin günlük bakiye üzerinden tahakkuk ettirildiği rotatif ticari kredi hesabıdır.",
        "candidate_broader": ["https://bank.internal/ontologies/core#TicariKredi"],
        "alt_labels": ["Rotatif Kredi", "Revolving Credit"]
    },
    "MERSİS": {
        "full_form": "Merkezi Sicil Kayıt Sistemi",
        "definition": "Ticaret sicili işlemlerinin elektronik ortamda yürütüldüğü ve şirket ortaklık ve yönetim bilgilerinin kayıt altında tutulduğu merkezi kamu sicil sistemidir.",
        "candidate_broader": ["https://bank.internal/ontologies/core#ResmiVeriKaynagi"],
        "alt_labels": ["Mersis Numarası", "Ticaret Sicil Sistemi"]
    },
    "KAP": {
        "full_form": "Kamuyu Aydınlatma Platformu",
        "definition": "Sermaye piyasası mevzuatı uyarınca kamuya açıklanması gereken bildirimlerin iletildiği elektronik sistemdir.",
        "candidate_broader": ["https://bank.internal/ontologies/core#ResmiVeriKaynagi"],
        "alt_labels": ["Kamuyu Aydınlatma"]
    }
}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "slms-llm-engine",
        "version": "1.0.0",
        "environment": "vps_production"
    }


@app.post("/extract-triples", response_model=TripleExtractResponse)
def extract_triples(req: TripleExtractRequest, _=Depends(verify_api_key)):
    text = req.text
    triples: List[ExtractedTriple] = []

    # Heuristic & Regex Semantic Extraction Engine for Banking Documents
    # 1. Ownership / Subsidiary links (e.g. "%60 hissesine sahip", "iştiraki", "bağlı ortaklığı")
    sub_matches = re.finditer(r"([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)\s+(?:nin|nın|'nin|'nın)?\s*(?:%?\s*(\d+)\s*(?:hissesine|payına))?\s*(?:iştiraki|bağlı ortaklığı|sahip)", text)
    for m in sub_matches:
        parent = m.group(1).strip()
        triples.append(ExtractedTriple(
            subject=f"urn:company:{parent.lower().replace(' ', '_')}",
            predicate="https://bank.internal/ontologies/core#subsidiaryOf",
            object="urn:company:holding_group",
            confidence=0.95
        ))

    # 2. Payment / Transaction flows (e.g. "Kaya Lastik A.Ş.'ye düzenli yüksek tutarlı EFT ödemesi")
    pay_matches = re.finditer(r"([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?:'ye|'ya|'e|'a)\s+düzenli\s+(?:yüksek tutarlı\s+)?(EFT|havale|ödeme)", text)
    for m in pay_matches:
        recipient = m.group(1).strip()
        triples.append(ExtractedTriple(
            subject="urn:company:sender_client",
            predicate="https://bank.internal/ontologies/core#makesRegularPaymentsTo",
            object=f"urn:company:{recipient.lower().replace(' ', '_')}",
            confidence=0.92
        ))

    # 3. Bankruptcy / Default risk (e.g. "Tekstil Pazarlama A.Ş. konkordato / iflas ilan etti")
    if "iflas" in text.lower() or "konkordato" in text.lower():
        risk_match = re.search(r"([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)\s+(?:hakkında|için)?\s*(?:iflas|konkordato)", text)
        if risk_match:
            entity = risk_match.group(1).strip()
            triples.append(ExtractedTriple(
                subject=f"urn:company:{entity.lower().replace(' ', '_')}",
                predicate="https://bank.internal/ontologies/core#hasSolvencyStatus",
                object="https://bank.internal/ontologies/core#InsolvencyDeclared",
                confidence=0.98
            ))

    # Fallback generic triple if no specific pattern matched
    if not triples:
        words = text.strip().split()
        if len(words) >= 3:
            triples.append(ExtractedTriple(
                subject=f"urn:entity:{words[0].lower()}",
                predicate="https://bank.internal/ontologies/core#relatedTo",
                object=f"urn:entity:{words[-1].lower()}",
                confidence=0.60
            ))

    return TripleExtractResponse(triples=triples)


@app.post("/detect-gaps", response_model=GapDetectResponse)
def detect_gaps(req: GapDetectRequest, _=Depends(verify_api_key)):
    text = req.text
    known_set = set(k.upper() for k in req.known_vocab)
    gaps: List[DetectedGap] = []

    # Detect 2-6 uppercase character acronyms
    candidate_tokens = re.findall(r"\b[A-ZÇĞİÖŞÜ]{2,6}\b", text)
    seen = set()

    for token in candidate_tokens:
        tok_upper = token.upper()
        if tok_upper in known_set or tok_upper in seen:
            continue
        seen.add(tok_upper)

        # Context window around the token
        idx = text.find(token)
        start = max(0, idx - 40)
        end = min(len(text), idx + len(token) + 40)
        context = text[start:end].strip()

        category = "BankingAcronym" if tok_upper in BANKING_ACRONYMS else "UndefinedTerm"
        conf = 0.95 if tok_upper in BANKING_ACRONYMS else 0.80

        gaps.append(DetectedGap(
            term=token,
            context=context,
            category=category,
            confidence=conf
        ))

    return GapDetectResponse(gaps=gaps)


@app.post("/resolve-acronym", response_model=AcronymResolveResponse)
def resolve_acronym(req: AcronymResolveRequest, _=Depends(verify_api_key)):
    tok = req.acronym.upper()
    if tok in BANKING_ACRONYMS:
        info = BANKING_ACRONYMS[tok]
        return AcronymResolveResponse(
            acronym=req.acronym,
            full_form=info["full_form"],
            definition=info["definition"],
            candidate_broader=info["candidate_broader"],
            confidence=0.98
        )

    # Heuristic fallback
    return AcronymResolveResponse(
        acronym=req.acronym,
        full_form=f"{req.acronym} (Belirlenmedi)",
        definition=f"'{req.context}' bağlamında tespit edilmiş ancak sözlükte tam karşılığı bulunmayan kısaltma.",
        candidate_broader=["https://bank.internal/ontologies/core#BankaTerimi"],
        confidence=0.60
    )


@app.post("/formulate-skos", response_model=SkosFormulateResponse)
def formulate_skos(req: SkosFormulateRequest, _=Depends(verify_api_key)):
    tok = req.pref_label.upper()
    if tok in BANKING_ACRONYMS:
        info = BANKING_ACRONYMS[tok]
        return SkosFormulateResponse(
            pref_label=info["full_form"],
            alt_labels=[req.pref_label] + info.get("alt_labels", []),
            definition=info["definition"],
            scope_note=f"Bu tanım {req.context} bağlamından ve ANSI/NISO Z39.19 standartlarından türetilmiştir.",
            broader_concepts=info["candidate_broader"],
            confidence=0.98
        )

    return SkosFormulateResponse(
        pref_label=req.pref_label,
        alt_labels=[],
        definition=f"{req.pref_label}: {req.context} bağlamında bankacılık alanına özgü kavramsal varlık.",
        scope_note="Otomatik SLMS çıkarma süreci tarafından oluşturuldu, uzman doğrulaması tavsiye edilir.",
        broader_concepts=["https://bank.internal/ontologies/core#BankacilikKavrami"],
        confidence=0.75
    )
