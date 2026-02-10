def solution(input_str: str):
    # Split input by newlines and parse N and S
    lines = input_str.strip().split('\n')
    N = int(lines[0])
    S = lines[1] if len(lines) > 1 else ""
    # Count the number of 'T's or 'A's in S
    count = sum(1 for c in S if c == 'T' or c == 'A')
    return count