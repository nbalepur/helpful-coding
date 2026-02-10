def solution(input_str: str):
    # Split input by newlines and parse N and S
    lines = input_str.strip().split('\n')
    N = int(lines[0])
    S = lines[1] if len(lines) > 1 else ""
    # Count the number of 'T's and 'A's in S
    t_count = sum(1 for c in S if c == 'T')
    a_count = sum(1 for c in S if c == 'A')
    if t_count > a_count:
        return 'T'
    elif a_count > t_count:
        return 'A'
    else:
        return None