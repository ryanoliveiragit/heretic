"""Fluxos ComfyUI (formato API) do motor de imagens do 451. Uso: python3 fluxos.py zimage|chroma "prompt" [w h seed] > req.json"""
import json, sys

def zimage(prompt, w=1024, h=1024, seed=1):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "7": {"class_type": "ModelSamplingAuraFlow", "inputs": {"shift": 3, "model": ["1", 0]}},
        "8": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 8, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1,
                                                    "model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0]}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"filename_prefix": "451", "images": ["9", 0]}},
    }

NEG_ADULTO = "child, children, minor, underage, teen, young-looking, childlike, school uniform, loli, low quality, blurry, deformed"

def chroma(prompt, w=896, h=1152, seed=1, steps=24, negativo=NEG_ADULTO):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "Chroma1-HD-fp8mixed.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "t5xxl_fp8_e4m3fn_scaled.safetensors", "type": "chroma", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": negativo, "clip": ["2", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": steps, "cfg": 4, "sampler_name": "euler", "scheduler": "beta", "denoise": 1,
                                                    "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0]}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"filename_prefix": "451", "images": ["9", 0]}},
    }

if __name__ == "__main__":
    tipo, prompt = sys.argv[1], sys.argv[2]
    extra = [int(x) for x in sys.argv[3:]]
    wf = (zimage if tipo == "zimage" else chroma)(prompt, *extra)
    print(json.dumps({"input": {"workflow": wf}}))

def com_referencia(wf, nome_img="ref.png", denoise=0.6):
    """Transforma um fluxo texto→imagem em edição: a referência (1 MP, lados múltiplos de 16) substitui o latente vazio."""
    wf = json.loads(json.dumps(wf))
    wf["20"] = {"class_type": "LoadImage", "inputs": {"image": nome_img}}
    wf["21"] = {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["20", 0], "upscale_method": "lanczos", "megapixels": 1.0, "resolution_steps": 16}}
    wf["22"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["21", 0], "vae": ["3", 0]}}
    wf["8"]["inputs"]["latent_image"] = ["22", 0]
    wf["8"]["inputs"]["denoise"] = denoise
    del wf["6"]
    return wf
