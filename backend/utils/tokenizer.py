from pythainlp.tokenize import word_tokenize

def thai_tokenizer(text: str) -> str:
    words = word_tokenize(text, keep_whitespace=False)
    return " ".join(words)